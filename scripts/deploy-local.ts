import { mkdirSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { createPublicClient, http, parseEther, toHex } from "viem";
import { anvil } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { deployStack } from "./local-stack.js";
import { json } from "../packages/protocol.js";
if (existsSync(".runtime/keys.json") || existsSync(".runtime/deployment.json"))
  throw new Error(
    "Existing deployment preserved. Use roll-local-stack.ts after review; never delete runtime state.",
  );
const client = createPublicClient({
  chain: anvil,
  transport: http("http://127.0.0.1:18555"),
});
if ((await client.getChainId()) !== 31337)
  throw new Error("Local chain required");
mkdirSync(".runtime", { recursive: true, mode: 0o700 });
const keys = {
  deployer: generatePrivateKey(),
  sponsor: generatePrivateKey(),
  owner: generatePrivateKey(),
  guardian: generatePrivateKey(),
};
writeFileSync(".runtime/keys.json", JSON.stringify(keys), { mode: 0o600 });
chmodSync(".runtime/keys.json", 0o600);
await client.request({
  method: "anvil_setBalance" as never,
  params: [
    privateKeyToAccount(keys.deployer).address,
    toHex(parseEther("100")),
  ] as never,
});
console.log(json(await deployStack(keys.deployer, keys.sponsor)));
