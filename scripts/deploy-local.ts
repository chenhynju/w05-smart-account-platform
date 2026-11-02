import {readFileSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,keccak256,parseEther,toHex,type Abi,type Hex} from 'viem';
import {anvil} from 'viem/chains';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {paymasterAbi,type Deployment,json} from '../packages/protocol.js';
const rpcUrl='http://127.0.0.1:18555';
const client=createPublicClient({chain:anvil,transport:http(rpcUrl)});
if(await client.getChainId()!==31337)throw new Error('Local chain 31337 required');
mkdirSync('.runtime',{recursive:true,mode:0o700});
// Fresh disposable keys only; do not read a system/default wallet or print secrets.
const keys={deployer:generatePrivateKey(),sponsor:generatePrivateKey(),owner:generatePrivateKey(),guardian:generatePrivateKey()};
writeFileSync('.runtime/keys.json',JSON.stringify(keys),{mode:0o600});chmodSync('.runtime/keys.json',0o600);
const signer=privateKeyToAccount(keys.deployer);
await client.request({method:'anvil_setBalance' as never,params:[signer.address,toHex(parseEther('100'))] as never});
const wallet=createWalletClient({account:signer,chain:anvil,transport:http(rpcUrl)});
const transactions:Hex[]=[];
async function deploy(file:string,name:string,args:unknown[]=[]) {
 const artifact=JSON.parse(readFileSync(`out/${file}/${name}.json`,'utf8')) as {abi:Abi;bytecode:{object:Hex}};
 const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args});
 const receipt=await client.waitForTransactionReceipt({hash});
 if(receipt.status!=='success'||!receipt.contractAddress)throw new Error(`Deployment failed ${name}`);
 transactions.push(hash);return receipt.contractAddress;
}
const entryPoint=await deploy('EntryPoint.sol','EntryPoint');
const factory=await deploy('AccountFactory.sol','AccountFactory',[entryPoint]);
const paymaster=await deploy('QuotaPaymaster.sol','QuotaPaymaster',[entryPoint,privateKeyToAccount(keys.sponsor).address]);
const counter=await deploy('Counter.sol','Counter');
const deposit=await wallet.writeContract({address:paymaster,abi:paymasterAbi,functionName:'deposit',value:parseEther('5')});
await client.waitForTransactionReceipt({hash:deposit});transactions.push(deposit);
const codeHashes:Record<string,Hex>={};for(const [name,address]of Object.entries({entryPoint,factory,paymaster,counter})){const code=await client.getCode({address});if(!code||code==='0x')throw new Error(`No code ${name}`);codeHashes[name]=keccak256(code);}
const deployment:Deployment={chainId:31337,rpcUrl,entryPoint,factory,paymaster,counter,transactions,codeHashes};
writeFileSync('.runtime/deployment.json',json(deployment));mkdirSync('deployments',{recursive:true});writeFileSync('deployments/local.json',json(deployment)+'\n');
console.log(json(deployment));
