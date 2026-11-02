import { concat, encodeAbiParameters, encodeFunctionData, parseAbi, toHex, type Address, type Hex } from 'viem';
import { getUserOperationHash, getUserOperationTypedData } from 'viem/account-abstraction';

export const chainId = 31337;
export const packedComponents = '(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)';
export const entryPointAbi = parseAbi([
  `function handleOps(${packedComponents}[] ops,address beneficiary)`,
  `function getUserOpHash(${packedComponents} op) view returns(bytes32)`,
  'function getNonce(address sender,uint192 key) view returns(uint256)',
  'function depositTo(address account) payable',
  'function balanceOf(address account) view returns(uint256)',
  'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)',
]);
export const accountAbi = parseAbi([
  'function executeOperation(uint256 nonce,uint256 expectedEpoch,(address target,uint256 value,bytes data)[] actions)',
  'function epoch() view returns(uint256)',
  'function threshold() view returns(uint256)',
  'function ownerList() view returns(address[])',
  'function guardianList() view returns(address[])',
  'function owners(address owner) view returns(bool)',
  'function isValidSignature(bytes32 hash,bytes signature) view returns(bytes4)',
  'function messageDigest(bytes32 hash) view returns(bytes32)',
  'function setSession(address key,address target,bytes4 selector,uint48 validUntil,uint256 budget)',
  'function revokeSession(address key)',
  'function sessions(address key) view returns(address target,bytes4 selector,uint48 validUntil,uint256 remaining,uint256 epoch)',
  'function setOwners(address[] list,uint256 required)',
  'function setGuardians(address[] list,uint256 required)',
  'function setPasskey(bytes32 x,bytes32 y,bytes32 rp,string origin)',
  'function revokePasskey()',
  'function proposeRecovery(address replacement)',
  'function approveRecovery()',
  'function completeRecovery()',
  'function cancelRecovery()',
  'function recoveryOwner() view returns(address)',
  'function recoveryReadyAt() view returns(uint48)',
  'function recoveryVotes() view returns(uint256)',
  'function recoveryId() view returns(bytes32)',
]);
export const factoryAbi = parseAbi([
  'function createAccount(address owner,address guardian,bytes32 salt) returns(address)',
  'function getAddress(address owner,address guardian,bytes32 salt) view returns(address)',
]);
export const paymasterAbi = parseAbi([
  `function sponsorshipDigest(${packedComponents} op,uint48 until,uint48 after_,uint256 policyEpoch) view returns(bytes32)`,
  'function setQuota(address account,uint256 budget)',
  'function remaining(address account) view returns(uint256)',
  'function quotaEpoch() view returns(uint256)',
  'function deposit() payable',
  'function getDeposit() view returns(uint256)',
]);
export const counterAbi = parseAbi(['function increment(uint256 amount) payable','function number() view returns(uint256)','function fail()']);
export type Action = {target:Address;value:bigint;data:Hex};
export type PackedOp = {sender:Address;nonce:bigint;initCode:Hex;callData:Hex;accountGasLimits:Hex;preVerificationGas:bigint;gasFees:Hex;paymasterAndData:Hex;signature:Hex};
export type Deployment = {chainId:number;rpcUrl:string;entryPoint:Address;factory:Address;paymaster:Address;counter:Address;transactions:Hex[];codeHashes:Record<string,Hex>};
export const pack128 = (high:bigint, low:bigint):Hex => {
  if (high < 0n || low < 0n || high >= 1n<<128n || low >= 1n<<128n) throw new Error('uint128 overflow');
  return toHex(high<<128n|low,{size:32});
};
export const unpack128 = (word:Hex):[bigint,bigint] => [BigInt(word)>>128n,BigInt(word)&((1n<<128n)-1n)];
export function makeOperation(sender:Address, nonce:bigint, epoch:bigint, actions:Action[]):PackedOp {
  return {sender,nonce,initCode:'0x',callData:encodeFunctionData({abi:accountAbi,functionName:'executeOperation',args:[nonce,epoch,actions]}),accountGasLimits:pack128(3_000_000n,1_500_000n),preVerificationGas:150_000n,gasFees:pack128(1_000_000_000n,2_000_000_000n),paymasterAndData:'0x',signature:'0x'};
}
export function unpackOperation(op:PackedOp) {
  const [verificationGasLimit,callGasLimit]=unpack128(op.accountGasLimits);
  const [maxPriorityFeePerGas,maxFeePerGas]=unpack128(op.gasFees);
  return {sender:op.sender,nonce:op.nonce,callData:op.callData,callGasLimit,verificationGasLimit,preVerificationGas:op.preVerificationGas,maxPriorityFeePerGas,maxFeePerGas,
    ...(op.paymasterAndData==='0x'?{}:{paymaster:op.paymasterAndData.slice(0,42) as Address,paymasterVerificationGasLimit:BigInt('0x'+op.paymasterAndData.slice(42,74)),paymasterPostOpGasLimit:BigInt('0x'+op.paymasterAndData.slice(74,106)),paymasterData:('0x'+op.paymasterAndData.slice(106)) as Hex}),signature:op.signature};
}
export function operationHash(op:PackedOp, entryPoint:Address):Hex {return getUserOperationHash({chainId,entryPointAddress:entryPoint,entryPointVersion:'0.8',userOperation:unpackOperation(op)});}
export function operationTypedData(op:PackedOp, entryPoint:Address) {return getUserOperationTypedData({chainId,entryPointAddress:entryPoint,userOperation:unpackOperation(op)});}
export function sponsorshipData(pm:Address, until:number, epoch:bigint, signature:Hex):Hex {
  return concat([pm,toHex(500_000n,{size:16}),toHex(0n,{size:16}),encodeAbiParameters([{type:'uint48'},{type:'uint48'},{type:'uint256'},{type:'bytes'}],[until,0,epoch,signature])]);
}
export function json(value:unknown):string {return JSON.stringify(value,(_,v:unknown)=>typeof v==='bigint'?v.toString():v);}
export function parseOperation(value:Record<string,unknown>):PackedOp {
  const bigintField=(key:string)=>{if(typeof value[key]!=='string'||!/^\d{1,78}$/.test(value[key] as string))throw new Error(`Invalid ${key}`);return BigInt(value[key] as string);};
  const hexField=(key:string,size?:number):Hex=>{const v=value[key];if(typeof v!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(v)||(size&&v.length!==2+size*2)||v.length>131074)throw new Error(`Invalid ${key}`);return v as Hex;};
  return {sender:hexField('sender',20),nonce:bigintField('nonce'),initCode:hexField('initCode'),callData:hexField('callData'),accountGasLimits:hexField('accountGasLimits',32),preVerificationGas:bigintField('preVerificationGas'),gasFees:hexField('gasFees',32),paymasterAndData:hexField('paymasterAndData'),signature:hexField('signature')};
}
