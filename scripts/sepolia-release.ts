import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  getContractAddress,
  encodeDeployData,
  encodeFunctionData,
  keccak256,
  parseEther,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { paymasterAbi, json } from "../packages/protocol.js";
import { validateEndpoint } from "../packages/network.js";
// Provider URLs can contain credentials; never print an unhandled network exception.
process.on("uncaughtException", () => {
  console.error(
    "Sepolia operation failed. Inspect preflight/receipt journals locally; do not retry an uncertain signed transaction.",
  );
  process.exit(1);
});
// --prepare creates fresh, isolated keys and an UNSIGNED review plan. It never signs or broadcasts.
// --broadcast additionally needs explicit user authorization (the environment flag is a guard, not consent).
const flags = process.argv.slice(2);
if (
  flags.some((f) => !["--prepare", "--broadcast"].includes(f)) ||
  (flags.includes("--prepare") && flags.includes("--broadcast"))
)
  throw new Error("Use --prepare OR --broadcast");
const broadcast = flags.includes("--broadcast");
if (
  broadcast &&
  process.env.W05_PUBLIC_BROADCAST_AUTHORIZED !== "sepolia-11155111"
)
  throw new Error("Public broadcast authorization is required");
const dir = ".runtime/sepolia";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const keyPath = dir + "/keys.json";
if (!existsSync(keyPath))
  writeFileSync(
    keyPath,
    json({ deployer: generatePrivateKey(), sponsor: generatePrivateKey() }),
    { mode: 0o600, flag: "wx" },
  );
if ((statSync(keyPath).mode & 0o077) !== 0)
  throw new Error("Sepolia key file must be mode 0600");
const keys = JSON.parse(readFileSync(keyPath, "utf8")) as {
  deployer: Hex;
  sponsor: Hex;
};
const deployer = privateKeyToAccount(keys.deployer),
  sponsor = privateKeyToAccount(keys.sponsor);
if (existsSync(".runtime/keys.json")) {
  const local = JSON.parse(
    readFileSync(".runtime/keys.json", "utf8"),
  ) as Record<string, Hex>;
  const old = Object.values(local).map((k) =>
    privateKeyToAccount(k).address.toLowerCase(),
  );
  if (
    [deployer.address, sponsor.address].some((a) =>
      old.includes(a.toLowerCase()),
    )
  )
    throw new Error("Local key reuse is forbidden");
}
execFileSync("python3", ["scripts/write-checkpoint.py", "--verify"], {
  stdio: "pipe",
});
execFileSync(
  "git",
  [
    "diff",
    "--exit-code",
    "HEAD",
    "--",
    "contracts",
    "packages",
    "services",
    "apps",
    "scripts",
    "tests",
    "package.json",
    "package-lock.json",
    "foundry.toml",
  ],
  { stdio: "pipe" },
);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const rpcUrl =
  process.env.W05_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
validateEndpoint(11155111, rpcUrl);
const client = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl, { timeout: 15000, retryCount: 0 }),
});
let nonce = 0,
  balance = 0n,
  rpcStatus = "BLOCKED",
  rpcError: string | undefined,
  baseFee = 0n;
try {
  if ((await client.getChainId()) !== 11155111) throw new Error("Wrong chain");
  nonce = await client.getTransactionCount({
    address: deployer.address,
    blockTag: "pending",
  });
  balance = await client.getBalance({ address: deployer.address });
  baseFee = (await client.getBlock()).baseFeePerGas ?? 0n;
  rpcStatus = "PASS";
} catch (e) {
  rpcError = "Read-only chain/nonce/balance preflight failed";
}
let traceRpcStatus = "BLOCKED",
  traceRpcError: string | undefined;
try {
  await client.request({
    method: "debug_traceCall" as never,
    params: [
      {
        from: deployer.address,
        to: "0x000000000000000000000000000000000000dead",
        data: "0x",
        gas: "0x5208",
      },
      "pending",
      { tracer: "callTracer", tracerConfig: { withLog: true } },
    ] as never,
  });
  traceRpcStatus = "PASS";
} catch (e) {
  traceRpcError =
    "Required pending debug_traceCall/callTracer/withLog unavailable";
}
const maxFeePerGas = 2_000_000_000n,
  maxPriorityFeePerGas = 1_000_000_000n;
const predicted = (offset: number) =>
  getContractAddress({ from: deployer.address, nonce: BigInt(nonce + offset) });
const entryPoint = predicted(0),
  factory = predicted(1),
  paymaster = predicted(2),
  counter = predicted(3);
type Tx = {
  name: string;
  to?: Address;
  data: Hex;
  value: bigint;
  gas: bigint;
  nonce: number;
};
const transactions: Tx[] = [];
const artifacts: Record<
  string,
  {
    abi: Abi;
    bytecode: { object: Hex };
    deployedBytecode: { object: Hex };
    metadata: {
      compiler: { version: string };
      settings: {
        viaIR: boolean;
        evmVersion: string;
        optimizer: { enabled: boolean; runs: number };
      };
    };
  }
> = {};
const artifactHashes: Record<string, string> = {};
const specs: [string, unknown[], bigint][] = [
  ["EntryPoint", [], 6_000_000n],
  ["AccountFactory", [entryPoint], 8_000_000n],
  ["QuotaPaymaster", [entryPoint, sponsor.address], 3_000_000n],
  ["Counter", [], 500_000n],
];
for (const [name, args, gas] of specs) {
  const raw = readFileSync(`out/${name}.sol/${name}.json`, "utf8");
  const a = JSON.parse(raw) as (typeof artifacts)[string];
  const m = a.metadata;
  if (
    m.compiler.version !== "0.8.38+commit.1835d247" ||
    !m.settings.viaIR ||
    m.settings.evmVersion !== "cancun" ||
    !m.settings.optimizer.enabled ||
    m.settings.optimizer.runs !== 200
  )
    throw new Error("Pinned artifact preflight failed: " + name);
  artifacts[name] = a;
  artifactHashes[name] = createHash("sha256").update(raw).digest("hex");
  transactions.push({
    name,
    data: encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object, args }),
    value: 0n,
    gas,
    nonce: nonce + transactions.length,
  });
}
transactions.push({
  name: "PaymasterDeposit",
  to: paymaster,
  data: encodeFunctionData({ abi: paymasterAbi, functionName: "deposit" }),
  value: parseEther("0.5"),
  gas: 100_000n,
  nonce: nonce + 4,
});
const maximumCost = transactions.reduce(
  (a, t) => a + t.value + t.gas * maxFeePerGas,
  0n,
);
const plan = {
  scope:
    "Ethereum Sepolia 11155111 only; unsigned until separate explicit authorization",
  sourceCommit,
  compiler: "0.8.38+commit.1835d247",
  deployer: deployer.address,
  sponsor: sponsor.address,
  predicted: { entryPoint, factory, paymaster, counter },
  rpcStatus,
  traceRpcStatus,
  traceRpcError,
  rpcError,
  balance,
  baseFee,
  maxFeePerGas,
  maxPriorityFeePerGas,
  maximumCost,
  artifactHashes,
  transactions,
  authorization: "NOT_GRANTED_BY_SCHEDULING",
};
mkdirSync("deployments", { recursive: true });
const planText = json(plan) + "\n";
if (!broadcast) {
  writeFileSync("deployments/sepolia-unsigned-plan.json", planText);
  console.log(
    json({
      ...plan,
      transactions: transactions.map((t) => ({
        ...t,
        dataHash: keccak256(t.data),
        data: undefined,
      })),
    }),
  );
  process.exit(0);
}
const approved = readFileSync("deployments/sepolia-unsigned-plan.json", "utf8");
const old = JSON.parse(approved) as typeof plan;
const reviewFields = (p: typeof plan) => ({
  sourceCommit: p.sourceCommit,
  deployer: p.deployer,
  sponsor: p.sponsor,
  predicted: p.predicted,
  artifactHashes: p.artifactHashes,
  transactions: p.transactions,
  maxFeePerGas: p.maxFeePerGas,
  maxPriorityFeePerGas: p.maxPriorityFeePerGas,
  maximumCost: p.maximumCost,
});
if (json(reviewFields(old)) !== json(reviewFields(plan)))
  throw new Error("Reviewed plan changed; regenerate and reauthorize");
if (
  rpcStatus !== "PASS" ||
  traceRpcStatus !== "PASS" ||
  balance < maximumCost ||
  baseFee + maxPriorityFeePerGas > maxFeePerGas
)
  throw new Error("RPC/balance/fee preflight blocked");
if (existsSync(dir + "/deployment.json"))
  throw new Error(
    "Existing Sepolia deployment preserved; no redeployment without a new reviewed plan",
  );
const wallet = createWalletClient({
  account: deployer,
  chain: sepolia,
  transport: http(rpcUrl, { timeout: 30000, retryCount: 0 }),
});
const receipts: unknown[] = [];
for (const tx of transactions) {
  // Preserve signed bytes before network I/O. On an uncertain response STOP and reconcile this hash; never silently re-sign.
  const request = await wallet.prepareTransactionRequest({
    to: tx.to,
    data: tx.data,
    value: tx.value,
    gas: tx.gas,
    nonce: tx.nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  const raw = await wallet.signTransaction(request);
  const hash = keccak256(raw);
  writeFileSync(
    `${dir}/transaction-${tx.nonce}.json`,
    json({ name: tx.name, hash, serializedTransaction: raw }),
    { mode: 0o600, flag: "wx", flush: true },
  );
  const sent = await client.sendRawTransaction({ serializedTransaction: raw });
  if (sent !== hash) throw new Error("RPC hash mismatch");
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: 2,
    timeout: 180000,
  });
  receipts.push({
    name: tx.name,
    hash,
    status: receipt.status,
    gasUsed: receipt.gasUsed,
    contractAddress: receipt.contractAddress,
  });
  writeFileSync(`${dir}/receipts.json`, json(receipts), { mode: 0o600 });
  if (receipt.status !== "success")
    throw new Error("Deployment transaction failed; stop and preserve journal");
}
const codeHashes: Record<string, Hex> = {};
for (const [name, address] of Object.entries({
  entryPoint,
  factory,
  paymaster,
  counter,
})) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error("Missing runtime " + name);
  codeHashes[name] = keccak256(code);
}
const manifest = {
  chainId: 11155111,
  rpcUrl,
  entryPoint,
  factory,
  paymaster,
  counter,
  transactions: (receipts as { hash: Hex }[]).map((r) => r.hash),
  codeHashes,
  sourceCommit,
  compiler: "0.8.38+commit.1835d247",
  artifactHashes,
};
writeFileSync(dir + "/deployment.json", json(manifest), {
  mode: 0o600,
  flag: "wx",
});
writeFileSync(
  "deployments/sepolia.json",
  json({ ...manifest, rpcUrl: "RPC_ENDPOINT_REDACTED" }) + "\n",
);
console.log(
  json({
    status: "DEPLOYED_VERIFY_REQUIRED",
    ...manifest,
    rpcUrl: "RPC_ENDPOINT_REDACTED",
  }),
);
