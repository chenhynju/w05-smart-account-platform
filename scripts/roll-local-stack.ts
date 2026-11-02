import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { deployStack } from "./local-stack.js";
import { json } from "../packages/protocol.js";
// Local side-by-side deployment. Preserve old contracts, balances, manifests, keys and service stores.
const keys = JSON.parse(readFileSync(".runtime/keys.json", "utf8")) as {
  deployer: Hex;
  sponsor: Hex;
};
console.log(json(await deployStack(keys.deployer, keys.sponsor)));
