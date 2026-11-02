import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  http,
  encodeDeployData,
  keccak256,
  parseAbi,
  type Abi,
  type Hex,
} from "viem";
import { anvil } from "viem/chains";
import { entryPointAbi, paymasterAbi, json } from "../packages/protocol.js";
import type { LocalManifest } from "./local-stack.js";
const manifest = JSON.parse(
  readFileSync("deployments/local.json", "utf8"),
) as LocalManifest;
if (manifest.rpcUrl !== "http://127.0.0.1:18555" || manifest.chainId !== 31337)
  throw new Error("Local manifest required");
const client = createPublicClient({
  chain: anvil,
  transport: http(manifest.rpcUrl),
});
if ((await client.getChainId()) !== 31337) throw new Error("Wrong chain");
const checks: unknown[] = [];
for (const [name, info] of Object.entries(manifest.contracts)) {
  const raw = readFileSync(`out/${info.file}/${name}.json`, "utf8");
  const artifact = JSON.parse(raw) as {
    abi: Abi;
    bytecode: { object: Hex };
    metadata: {
      compiler: { version: string };
      settings: {
        evmVersion: string;
        viaIR: boolean;
        optimizer: { enabled: boolean; runs: number };
      };
    };
  };
  if (
    createHash("sha256").update(artifact.bytecode.object).digest("hex") !==
    manifest.artifactHashes[name]
  )
    throw new Error(`Creation bytecode changed ${name}`);
  if (
    !artifact.metadata.compiler.version.startsWith("0.8.38+") ||
    artifact.metadata.settings.evmVersion !== "cancun" ||
    !artifact.metadata.settings.viaIR ||
    !artifact.metadata.settings.optimizer.enabled ||
    artifact.metadata.settings.optimizer.runs !== 200
  )
    throw new Error(`Compiler settings mismatch ${name}`);
  const transaction = await client.getTransaction({ hash: info.transaction });
  const receipt = await client.getTransactionReceipt({
    hash: info.transaction,
  });
  if (
    transaction.input !==
      encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args: info.args,
      }) ||
    receipt.contractAddress?.toLowerCase() !== info.address.toLowerCase() ||
    receipt.status !== "success"
  )
    throw new Error(`Creation evidence mismatch ${name}`);
  checks.push({
    contract: name,
    address: info.address,
    transaction: info.transaction,
    block: receipt.blockNumber,
    compiler: artifact.metadata.compiler.version,
    settings: artifact.metadata.settings,
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
    throw new Error(`Runtime changed ${key}`);
}
const immutableAbi = parseAbi(["function entryPoint() view returns(address)"]);
for (const address of [manifest.factory, manifest.paymaster])
  if (
    (
      await client.readContract({
        address,
        abi: immutableAbi,
        functionName: "entryPoint",
      })
    ).toLowerCase() !== manifest.entryPoint.toLowerCase()
  )
    throw new Error("EntryPoint immutable mismatch");
const deposit = await client.readContract({
  address: manifest.paymaster,
  abi: paymasterAbi,
  functionName: "getDeposit",
});
const epDeposit = await client.readContract({
  address: manifest.entryPoint,
  abi: entryPointAbi,
  functionName: "balanceOf",
  args: [manifest.paymaster],
});
if (deposit !== epDeposit || deposit === 0n)
  throw new Error("Deposit mismatch");
const result = {
  scope: "Local Anvil only; no public-chain deployment",
  sourceCommit: manifest.sourceCommit,
  checks,
  runtimeHashes: manifest.codeHashes,
  deposit,
  status: "PASS",
};
writeFileSync("evidence/deployment-verification.json", json(result) + "\n");
console.log(json(result));
