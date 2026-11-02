import type { Chain } from "viem";
import { anvil, sepolia } from "viem/chains";
export function networkFor(id: number): Chain {
  if (id === anvil.id) return anvil;
  if (id === sepolia.id) return sepolia;
  throw new Error("Only isolated Anvil or Ethereum Sepolia is supported");
}
export function validateEndpoint(id: number, endpoint: string) {
  networkFor(id);
  const url = new URL(endpoint);
  if (url.username || url.password || url.hash)
    throw new Error(
      "RPC credentials/fragments must not be embedded in manifests",
    );
  if (id === anvil.id && endpoint !== "http://127.0.0.1:18555")
    throw new Error("Local RPC mismatch");
  if (id === sepolia.id && url.protocol !== "https:")
    throw new Error("Public testnet requires HTTPS RPC");
}
// Build-time network selection is explicit; an unsupported value must fail, never fall back.
const target = process.env.NEXT_PUBLIC_W05_NETWORK ?? "local";
if (target !== "local" && target !== "sepolia")
  throw new Error("Invalid NEXT_PUBLIC_W05_NETWORK");
export const webChain = networkFor(target === "local" ? anvil.id : sepolia.id);
