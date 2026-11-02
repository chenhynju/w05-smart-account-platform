"use client";
import {useState} from 'react';
import {WagmiProvider,createConfig,http} from 'wagmi';
import {injected} from 'wagmi/connectors';
import {anvil} from 'wagmi/chains';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const config=createConfig({chains:[anvil],connectors:[injected()],transports:{[anvil.id]:http('http://localhost:3155/api/rpc')},ssr:true});
export function Providers({children}:{children:React.ReactNode}){const [query]=useState(()=>new QueryClient());return <WagmiProvider config={config}><QueryClientProvider client={query}>{children}</QueryClientProvider></WagmiProvider>}
