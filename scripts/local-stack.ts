import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { paymasterAbi, json, type Deployment } from "../packages/protocol.js";
export type LocalManifest = Deployment & {
  compiler: string;
  sourceCommit: string;
  artifactHashes: Record<string, string>;
  contracts: Record<
    string,
    { file: string; address: Address; transaction: Hex; args: unknown[] }
  >;
};
export async function deployStack(
  deployer: Hex,
  sponsorKey: Hex,
): Promise<LocalManifest> {
  try {
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
        "foundry.toml",
        "package.json",
        "package-lock.json",
      ],
      { stdio: "pipe" },
    );
  } catch {
    throw new Error(
      "Commit and review source changes before local release deployment",
    );
  }
  const rpcUrl = "http://127.0.0.1:18555";
  const client = createPublicClient({ chain: anvil, transport: http(rpcUrl) });
  if ((await client.getChainId()) !== 31337)
    throw new Error("Local chain 31337 required");
  const wallet = createWalletClient({
    account: privateKeyToAccount(deployer),
    chain: anvil,
    transport: http(rpcUrl),
  });
  const transactions: Hex[] = [];
  const contracts: LocalManifest["contracts"] = {};
  const artifactHashes: Record<string, string> = {};
  async function deploy(name: string, file: string, args: unknown[] = []) {
    const raw = readFileSync(`out/${file}/${name}.json`, "utf8");
    const artifact = JSON.parse(raw) as {
      abi: Abi;
      bytecode: { object: Hex };
      metadata: { compiler: { version: string } };
    };
    if (!artifact.metadata.compiler.version.startsWith("0.8.38+"))
      throw new Error("Final solc 0.8.38 artifacts required");
    const hash = await wallet.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress)
      throw new Error(`Failed ${name}`);
    transactions.push(hash);
    contracts[name] = {
      file,
      address: receipt.contractAddress,
      transaction: hash,
      args,
    };
    artifactHashes[name] = createHash("sha256").update(raw).digest("hex");
    return receipt.contractAddress;
  }
  const entryPoint = await deploy("EntryPoint", "EntryPoint.sol");
  const factory = await deploy("AccountFactory", "AccountFactory.sol", [
    entryPoint,
  ]);
  const paymaster = await deploy("QuotaPaymaster", "QuotaPaymaster.sol", [
    entryPoint,
    privateKeyToAccount(sponsorKey).address,
  ]);
  const counter = await deploy("Counter", "Counter.sol");
  const deposit = await wallet.writeContract({
    address: paymaster,
    abi: paymasterAbi,
    functionName: "deposit",
    value: parseEther("5"),
  });
  if (
    (await client.waitForTransactionReceipt({ hash: deposit })).status !==
    "success"
  )
    throw new Error("Deposit failed");
  transactions.push(deposit);
  const codeHashes: Record<string, Hex> = {};
  for (const [name, address] of Object.entries({
    entryPoint,
    factory,
    paymaster,
    counter,
  })) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") throw new Error(`No code ${name}`);
    codeHashes[name] = keccak256(code);
  }
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const manifest: LocalManifest = {
    chainId: 31337,
    rpcUrl,
    entryPoint,
    factory,
    paymaster,
    counter,
    transactions,
    codeHashes,
    compiler: "0.8.38+commit.1835d247",
    sourceCommit,
    artifactHashes,
    contracts,
  };
  mkdirSync("deployments", { recursive: true });
  if (existsSync("deployments/local.json"))
    writeFileSync(
      `deployments/local-before-${Date.now()}.json`,
      readFileSync("deployments/local.json"),
    );
  writeFileSync(".runtime/deployment.json", json(manifest));
  writeFileSync("deployments/local.json", json(manifest) + "\n");
  return manifest;
}
