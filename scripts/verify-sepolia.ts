import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  http,
  encodeDeployData,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseEther,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import {
  entryPointAbi,
  paymasterAbi,
  json,
  type Deployment,
} from "../packages/protocol.js";
import { validateEndpoint } from "../packages/network.js";
// Read-only verifier: no keys, wallet client, signature or transaction submission.
const manifest = JSON.parse(
  readFileSync(".runtime/sepolia/deployment.json", "utf8"),
) as Deployment & {
  sourceCommit: string;
  artifactHashes: Record<string, string>;
};
const plan = JSON.parse(
  readFileSync("deployments/sepolia-unsigned-plan.json", "utf8"),
) as {
  sourceCommit: string;
  deployer: Address;
  sponsor: Address;
  transactions: {
    name: string;
    data: Hex;
    to?: Address;
    value: string;
    gas: string;
    nonce: number;
  }[];
};
if (
  manifest.chainId !== 11155111 ||
  plan.sourceCommit !== manifest.sourceCommit
)
  throw new Error("Sepolia source/manifest mismatch");
validateEndpoint(manifest.chainId, manifest.rpcUrl);
const client = createPublicClient({
  chain: sepolia,
  transport: http(manifest.rpcUrl, { timeout: 15000, retryCount: 0 }),
});
if ((await client.getChainId()) !== 11155111) throw new Error("Wrong chain");
if (manifest.transactions.length !== 5 || plan.transactions.length !== 5)
  throw new Error("Five reviewed transactions required");
const specs: [string, Address, unknown[]][] = [
  ["EntryPoint", manifest.entryPoint, []],
  ["AccountFactory", manifest.factory, [manifest.entryPoint]],
  ["QuotaPaymaster", manifest.paymaster, [manifest.entryPoint, plan.sponsor]],
  ["Counter", manifest.counter, []],
];
const checks: unknown[] = [];
const latest = await client.getBlockNumber();
for (let i = 0; i < 5; i++) {
  const expected = plan.transactions[i],
    hash = manifest.transactions[i];
  const transaction = await client.getTransaction({ hash }),
    receipt = await client.getTransactionReceipt({ hash });
  if (
    receipt.status !== "success" ||
    latest < receipt.blockNumber + 1n ||
    transaction.from.toLowerCase() !== plan.deployer.toLowerCase() ||
    transaction.nonce !== expected.nonce ||
    transaction.input !== expected.data ||
    transaction.value !== BigInt(expected.value) ||
    transaction.gas !== BigInt(expected.gas) ||
    transaction.chainId !== 11155111 ||
    (transaction.maxFeePerGas ?? 0n) > 2_000_000_000n
  )
    throw new Error("Transaction/receipt mismatch " + i);
  if (i < 4) {
    const [name, address, args] = specs[i];
    const raw = readFileSync(`out/${name}.sol/${name}.json`, "utf8");
    const artifact = JSON.parse(raw) as {
      abi: Abi;
      bytecode: { object: Hex };
      metadata: {
        compiler: { version: string };
        settings: {
          viaIR: boolean;
          evmVersion: string;
          optimizer: { enabled: boolean; runs: number };
        };
      };
    };
    const m = artifact.metadata;
    if (
      createHash("sha256").update(raw).digest("hex") !==
        manifest.artifactHashes[name] ||
      m.compiler.version !== "0.8.38+commit.1835d247" ||
      !m.settings.viaIR ||
      m.settings.evmVersion !== "cancun" ||
      !m.settings.optimizer.enabled ||
      m.settings.optimizer.runs !== 200
    )
      throw new Error("Artifact/compiler mismatch " + name);
    if (
      transaction.to !== null ||
      receipt.contractAddress?.toLowerCase() !== address.toLowerCase() ||
      expected.data !==
        encodeDeployData({
          abi: artifact.abi,
          bytecode: artifact.bytecode.object,
          args,
        })
    )
      throw new Error("Creation/constructor mismatch " + name);
  } else if (
    transaction.to?.toLowerCase() !== manifest.paymaster.toLowerCase() ||
    transaction.value !== parseEther("0.5") ||
    transaction.input !==
      encodeFunctionData({ abi: paymasterAbi, functionName: "deposit" })
  )
    throw new Error("Deposit creation transaction mismatch");
  checks.push({
    name: expected.name,
    hash,
    block: receipt.blockNumber,
    status: "PASS",
  });
}
for (const [key, address] of Object.entries({
  entryPoint: manifest.entryPoint,
  factory: manifest.factory,
  paymaster: manifest.paymaster,
  counter: manifest.counter,
})) {
  const code = await client.getCode({ address });
  if (!code || keccak256(code) !== manifest.codeHashes[key])
    throw new Error("Runtime hash mismatch " + key);
}
const policyAbi = parseAbi([
  "function entryPoint() view returns(address)",
  "function owner() view returns(address)",
  "function sponsor() view returns(address)",
]);
for (const address of [manifest.factory, manifest.paymaster])
  if (
    (
      await client.readContract({
        address,
        abi: policyAbi,
        functionName: "entryPoint",
      })
    ).toLowerCase() !== manifest.entryPoint.toLowerCase()
  )
    throw new Error("Immutable EntryPoint mismatch");
for (const [functionName, expected] of [
  ["owner", plan.deployer],
  ["sponsor", plan.sponsor],
] as const)
  if (
    (
      await client.readContract({
        address: manifest.paymaster,
        abi: policyAbi,
        functionName,
      })
    ).toLowerCase() !== expected.toLowerCase()
  )
    throw new Error("Paymaster authority mismatch");
const deposit = await client.readContract({
  address: manifest.paymaster,
  abi: paymasterAbi,
  functionName: "getDeposit",
});
if (
  deposit === 0n ||
  deposit !==
    (await client.readContract({
      address: manifest.entryPoint,
      abi: entryPointAbi,
      functionName: "balanceOf",
      args: [manifest.paymaster],
    }))
)
  throw new Error("Deposit mismatch");
const report = {
  scope:
    "Sepolia read-only deployment/constructor/runtime/authority verification; business E2E and remote source publication are separate",
  sourceCommit: manifest.sourceCommit,
  checks,
  deposit,
  status: "PASS",
};
writeFileSync(
  "evidence/sepolia-deployment-verification.json",
  json(report) + "\n",
);
console.log(json(report));
