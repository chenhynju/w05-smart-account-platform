"use client";
import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { webChain } from "../../../packages/network";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const config = createConfig({
  chains: [webChain],
  connectors: [injected()],
  transports: { [webChain.id]: http("/api/rpc") },
  ssr: true,
});
export function Providers({ children }: { children: React.ReactNode }) {
  const [query] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={query}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
