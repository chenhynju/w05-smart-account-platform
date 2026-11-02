import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { json, type Deployment } from "../packages/protocol.js";
const config = JSON.parse(
  readFileSync(".runtime/deployment.json", "utf8"),
) as Deployment;
if (config.chainId !== 31337 || config.rpcUrl !== "http://127.0.0.1:18555")
  throw new Error("Local only");
const keys = JSON.parse(readFileSync(".runtime/keys.json", "utf8")) as {
  deployer: Hex;
};
const publicClient = createPublicClient({
  chain: anvil,
  transport: http(config.rpcUrl),
});
if ((await publicClient.getChainId()) !== 31337) throw new Error("Wrong chain");
const wallet = createWalletClient({
  account: privateKeyToAccount(keys.deployer),
  chain: anvil,
  transport: http(config.rpcUrl),
});
const artifact = JSON.parse(
  readFileSync("out/AccountFactory.sol/AccountFactory.json", "utf8"),
) as { abi: Abi; bytecode: { object: Hex } };
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [config.entryPoint],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress)
  throw new Error("Failed");
writeFileSync(
  `deployments/local-before-${Date.now()}.json`,
  json(config) + "\n",
);
config.factory = receipt.contractAddress;
config.transactions.push(hash);
const code = await publicClient.getCode({ address: config.factory });
if (!code) throw new Error("No code");
config.codeHashes.factory = keccak256(code);
writeFileSync(".runtime/deployment.json", json(config));
writeFileSync("deployments/local.json", json(config) + "\n");
console.log(json({ factory: config.factory, transaction: hash }));
