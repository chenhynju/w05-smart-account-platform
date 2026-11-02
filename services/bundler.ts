import {createServer, type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,decodeEventLog,encodeFunctionData,parseEther,recoverMessageAddress,toHex,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {anvil} from 'viem/chains';
import {z} from 'zod';
import {accountAbi,entryPointAbi,factoryAbi,paymasterAbi,counterAbi,makeOperation,parseOperation,operationHash,sponsorshipData,json,type Deployment,type PackedOp,type Action} from '../packages/protocol.js';
const config=JSON.parse(readFileSync('.runtime/deployment.json','utf8')) as Deployment;
const keys=JSON.parse(readFileSync('.runtime/keys.json','utf8')) as {deployer:Hex;sponsor:Hex};
if(config.chainId!==31337||config.rpcUrl!=='http://127.0.0.1:18555')throw new Error('Local configuration required');
const client=createPublicClient({chain:anvil,transport:http(config.rpcUrl,{timeout:15000,retryCount:1})});
const admin=privateKeyToAccount(keys.deployer),sponsor=privateKeyToAccount(keys.sponsor);
const wallet=createWalletClient({account:admin,chain:anvil,transport:http(config.rpcUrl)});
if(await client.getChainId()!==31337)throw new Error('Wrong chain');
for(const [name,address]of Object.entries({entryPoint:config.entryPoint,factory:config.factory,paymaster:config.paymaster,counter:config.counter})){
 const {keccak256}=await import('viem');const code=await client.getCode({address});
 if(!code||keccak256(code)!==config.codeHashes[name])throw new Error(`Unexpected deployed code ${name}`);
}
type OperationRecord={hash:Hex;transactionHash?:Hex;status:'preparing'|'submitted'|'succeeded'|'execution_failed'|'unknown';error?:string;blockNumber?:string};
type Store={accounts:Address[];allocated:string;operations:Record<string,OperationRecord>};
const storePath='.runtime/service-state.json';
const state:Store=existsSync(storePath)?JSON.parse(readFileSync(storePath,'utf8')) as Store:{accounts:[],allocated:'0',operations:{}};
function save(){writeFileSync(storePath+'.tmp',json(state),{mode:0o600});renameSync(storePath+'.tmp',storePath);}
const challenges=new Map<string,{owner:Address;expires:number}>();
const buckets=new Map<string,{start:number;count:number}>();
let queue=Promise.resolve();
function serial<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.then(fn,fn);queue=next.then(()=>undefined,()=>undefined);return next;}
const addressSchema=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v as Address);
const hexSchema=z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).transform(v=>v as Hex);
const actionSchema=z.object({target:addressSchema,value:z.string().regex(/^\d{1,78}$/).transform(BigInt),data:hexSchema});
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(json(value));}
async function body(req:IncomingMessage):Promise<unknown>{let text='';for await(const part of req){text+=String(part);if(Buffer.byteLength(text)>131072)throw new Error('Body too large');}return JSON.parse(text||'{}') as unknown;}
function allowedAccount(address:Address){if(!state.accounts.some(a=>a.toLowerCase()===address.toLowerCase()))throw new Error('Account not enrolled');}
async function pack(sender:Address,actions:Action[]):Promise<PackedOp>{allowedAccount(sender);const [nonce,epoch]=await Promise.all([client.readContract({address:config.entryPoint,abi:entryPointAbi,functionName:'getNonce',args:[sender,0n]}),client.readContract({address:sender,abi:accountAbi,functionName:'epoch'})]);return makeOperation(sender,nonce,epoch,actions);}
async function addSponsorship(op:PackedOp):Promise<PackedOp>{
 const [quotaEpoch,block]=await Promise.all([client.readContract({address:config.paymaster,abi:paymasterAbi,functionName:'quotaEpoch'}),client.getBlock()]);
 const until=Number(block.timestamp)+300;
 op.paymasterAndData=sponsorshipData(config.paymaster,until,quotaEpoch,'0x');
 const digest=await client.readContract({address:config.paymaster,abi:paymasterAbi,functionName:'sponsorshipDigest',args:[op,until,0,quotaEpoch]});
 op.paymasterAndData=sponsorshipData(config.paymaster,until,quotaEpoch,await sponsor.sign({hash:digest}));return op;
}
async function simulate(op:PackedOp){
 allowedAccount(op.sender);
 const hash=operationHash(op,config.entryPoint);
 const onchain=await client.readContract({address:config.entryPoint,abi:entryPointAbi,functionName:'getUserOpHash',args:[op]});
 if(hash!==onchain)throw new Error('SDK/EntryPoint hash mismatch');
 const data=encodeFunctionData({abi:entryPointAbi,functionName:'handleOps',args:[[op],admin.address]});
 await client.call({account:admin.address,to:config.entryPoint,data,gas:10_000_000n});
 const gas=await client.estimateGas({account:admin.address,to:config.entryPoint,data});
 return {hash,gas:gas.toString(),validation:'passed',execution:'Receipt/event required; handleOps can include a reverting operation'};
}
async function reconcile(record:OperationRecord):Promise<OperationRecord>{
 if(!record.transactionHash){
  const logs=await client.getLogs({address:config.entryPoint,event:entryPointAbi.find(a=>a.type==='event'&&a.name==='UserOperationEvent') as Extract<typeof entryPointAbi[number],{type:'event'}>,args:{userOpHash:record.hash},fromBlock:0n,toBlock:'latest'});
  const hit=logs[0];if(hit){record.transactionHash=hit.transactionHash;record.status='submitted';}else {record.status='unknown';save();return record;}
 }
 try{
  const receipt=await client.getTransactionReceipt({hash:record.transactionHash});
  for(const log of receipt.logs){if(log.address.toLowerCase()!==config.entryPoint.toLowerCase())continue;try{const event=decodeEventLog({abi:entryPointAbi,data:log.data,topics:log.topics});if(event.eventName==='UserOperationEvent'&&event.args.userOpHash===record.hash){record.status=event.args.success?'succeeded':'execution_failed';record.blockNumber=receipt.blockNumber.toString();save();return record;}}catch{}}
  if(receipt.status==='reverted'){record.status='execution_failed';record.error='Bundler transaction reverted';}else record.status='unknown';
 }catch{record.status='submitted';}save();return record;
}
const rpcAllowed=new Set(['eth_chainId','eth_getBalance','eth_getTransactionCount','eth_getTransactionReceipt','eth_getBlockByNumber','eth_blockNumber','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_sendRawTransaction']);
const server=createServer(async(req,res)=>{
 const started=Date.now();const url=new URL(req.url??'/','http://127.0.0.1:4355');
 try{
  const key=req.socket.remoteAddress??'unknown';const now=Date.now();let bucket=buckets.get(key);if(!bucket||now-bucket.start>60000){bucket={start:now,count:0};buckets.set(key,bucket);}if(++bucket.count>240){reply(res,429,{error:'Rate limit; retry after one minute'});return;}
  if(req.method==='POST'&&!['http://localhost:3155','http://127.0.0.1:3155'].includes(req.headers.origin??'')){reply(res,403,{error:'Untrusted origin'});return;}
  if(req.method==='GET'&&url.pathname==='/config'){reply(res,200,{...config,scope:'Isolated local chain / allowlisted bundler',sponsorDeposit:await client.readContract({address:config.paymaster,abi:paymasterAbi,functionName:'getDeposit'})});return;}
  if(req.method==='GET'&&url.pathname==='/health'){reply(res,200,{chainId:await client.getChainId(),block:await client.getBlockNumber()});return;}
  if(req.method==='GET'&&url.pathname==='/challenge'){
   const owner=addressSchema.parse(url.searchParams.get('owner'));const challenge=toHex(randomBytes(32));
   for(const [k,v]of challenges)if(v.expires<Date.now())challenges.delete(k);
   if(challenges.size>=1000)throw new Error('Challenge capacity reached');
   challenges.set(challenge,{owner,expires:Date.now()+120000});
   reply(res,200,{challenge,message:`W05 account enrollment\nchain:31337\nfactory:${config.factory}\nowner:${owner}\nchallenge:${challenge}`});return;
  }
  if(req.method==='POST'&&url.pathname==='/accounts'){
   const data=z.object({owner:addressSchema,guardian:addressSchema,salt:hexSchema.refine(v=>v.length===66),challenge:hexSchema,signature:hexSchema}).parse(await body(req));
   const challenge=challenges.get(data.challenge);challenges.delete(data.challenge);
   if(!challenge||challenge.expires<Date.now()||challenge.owner.toLowerCase()!==data.owner.toLowerCase())throw new Error('Expired or unknown enrollment challenge');
   const message=`W05 account enrollment\nchain:31337\nfactory:${config.factory}\nowner:${data.owner}\nchallenge:${data.challenge}`;
   if((await recoverMessageAddress({message,signature:data.signature})).toLowerCase()!==data.owner.toLowerCase())throw new Error('Invalid owner proof');
   const account=await serial(async()=>{
    const address=await client.readContract({address:config.factory,abi:factoryAbi,functionName:'getAddress',args:[data.owner,data.guardian,data.salt]});
    if(state.accounts.includes(address))return address;
    if(state.accounts.length>=10||BigInt(state.allocated)+parseEther('0.05')>parseEther('0.5'))throw new Error('Local sponsorship enrollment cap reached');
    const hash=await wallet.writeContract({address:config.factory,abi:factoryAbi,functionName:'createAccount',args:[data.owner,data.guardian,data.salt]});
    const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Account deployment failed');
    const quota=await wallet.writeContract({address:config.paymaster,abi:paymasterAbi,functionName:'setQuota',args:[address,parseEther('0.05')]});
    if((await client.waitForTransactionReceipt({hash:quota})).status!=='success')throw new Error('Quota failed');
    // Local test assets only. No external faucet, wallet or network is ever used.
    for(const a of [address,data.guardian])await client.request({method:'anvil_setBalance' as never,params:[a,toHex(parseEther('1'))] as never});
    state.accounts.push(address);state.allocated=(BigInt(state.allocated)+parseEther('0.05')).toString();save();return address;
   });reply(res,201,{account});return;
  }
  if(req.method==='GET'&&url.pathname==='/account'){
   const address=addressSchema.parse(url.searchParams.get('address'));allowedAccount(address);
   const [epoch,threshold,owners,number,quota,balance,recoveryOwner,recoveryReadyAt,recoveryVotes]=await Promise.all([
    client.readContract({address,abi:accountAbi,functionName:'epoch'}),client.readContract({address,abi:accountAbi,functionName:'threshold'}),client.readContract({address,abi:accountAbi,functionName:'ownerList'}),client.readContract({address:config.counter,abi:counterAbi,functionName:'number'}),client.readContract({address:config.paymaster,abi:paymasterAbi,functionName:'remaining',args:[address]}),client.getBalance({address}),client.readContract({address,abi:accountAbi,functionName:'recoveryOwner'}),client.readContract({address,abi:accountAbi,functionName:'recoveryReadyAt'}),client.readContract({address,abi:accountAbi,functionName:'recoveryVotes'})]);
   reply(res,200,{address,epoch,threshold,owners,number,quota,balance,recoveryOwner,recoveryReadyAt,recoveryVotes});return;
  }
  if(req.method==='POST'&&url.pathname==='/prepare'){
   const data=z.object({sender:addressSchema,actions:z.array(actionSchema).min(1).max(16)}).parse(await body(req));
   const op=await addSponsorship(await pack(data.sender,data.actions));reply(res,200,{operation:op,hash:operationHash(op,config.entryPoint)});return;
  }
  if(req.method==='POST'&&(url.pathname==='/simulate'||url.pathname==='/submit')){
   const input=z.record(z.string(),z.unknown()).parse(await body(req));const op=parseOperation(input);
   if(url.pathname==='/simulate'){reply(res,200,await simulate(op));return;}
   const record=await serial(async()=>{
    const hash=operationHash(op,config.entryPoint);const previous=state.operations[hash];if(previous)return reconcile(previous);
    await simulate(op);const current:OperationRecord={hash,status:'preparing'};state.operations[hash]=current;save();
    try{current.transactionHash=await wallet.writeContract({address:config.entryPoint,abi:entryPointAbi,functionName:'handleOps',args:[[op],admin.address],gas:10_000_000n});current.status='submitted';save();await client.waitForTransactionReceipt({hash:current.transactionHash,timeout:20000});return reconcile(current);}catch(error){current.status=current.transactionHash?'submitted':'unknown';current.error=error instanceof Error?error.message.slice(0,300):'Submission error';save();return current;}
   });reply(res,200,record);return;
  }
  if(req.method==='GET'&&url.pathname==='/operation'){
   const hash=hexSchema.parse(url.searchParams.get('hash'));const record=state.operations[hash];if(!record){reply(res,404,{error:'Unknown operation'});return;}reply(res,200,await reconcile(record));return;
  }
  if(req.method==='POST'&&url.pathname==='/rpc'){
   const data=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string(),z.number()]),method:z.string(),params:z.array(z.unknown()).optional()}).parse(await body(req));
   if(!rpcAllowed.has(data.method))throw new Error('RPC method not allowed');
   const result=await client.request({method:data.method as never,params:(data.params??[]) as never});reply(res,200,{jsonrpc:'2.0',id:data.id,result});return;
  }
  reply(res,404,{error:'Not found'});
 }catch(error){const message=error instanceof Error?error.message:'Request failed';reply(res,400,{error:message.slice(0,1500)});}
 finally {console.log(json({path:url.pathname,method:req.method,ms:Date.now()-started,status:res.statusCode}));}
});
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(4355,'127.0.0.1',()=>console.log('W05 local allowlisted service on 127.0.0.1:4355'));
