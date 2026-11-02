import { openSync, closeSync, fsyncSync } from "node:fs";
import { BaseError, HttpRequestError, TimeoutError } from "viem";
import { concat, keccak256 } from "viem";
import { pack128, unpack128, unpackOperation } from "../packages/protocol.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  decodeEventLog,
  encodeFunctionData,
  parseEther,
  recoverMessageAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  networkFor,
  validateEndpoint,
  nextPublicGasReservation,
} from "../packages/network.js";
import { z } from "zod";
import {
  accountAbi,
  entryPointAbi,
  factoryAbi,
  paymasterAbi,
  counterAbi,
  makeOperation,
  parseOperation,
  operationHash,
  sponsorshipData,
  json,
  type Deployment,
  type PackedOp,
  type Action,
} from "../packages/protocol.js";
const target = process.env.W05_NETWORK ?? "local";
if (target !== "local" && target !== "sepolia")
  throw new Error("Invalid W05_NETWORK");
const runtimeDir = target === "local" ? ".runtime" : ".runtime/sepolia";
if (
  target === "sepolia" &&
  process.env.W05_PUBLIC_BROADCAST_AUTHORIZED !== "sepolia-11155111"
)
  throw new Error(
    "Public signing/broadcast is disabled; obtain explicit user authorization before starting this profile",
  );
const config = JSON.parse(
  readFileSync(`${runtimeDir}/deployment.json`, "utf8"),
) as Deployment;
const keys = JSON.parse(readFileSync(`${runtimeDir}/keys.json`, "utf8")) as {
  deployer: Hex;
  sponsor: Hex;
};
if (config.chainId !== (target === "local" ? 31337 : 11155111))
  throw new Error("Profile/manifest chain mismatch");
validateEndpoint(config.chainId, config.rpcUrl);
const chain = networkFor(config.chainId);
const enrollmentBudget = parseEther(target === "local" ? "0.5" : "0.25");
const allocationCap = parseEther(target === "local" ? "5" : "0.5");
const client = createPublicClient({
  chain,
  transport: http(config.rpcUrl, { timeout: 15000, retryCount: 1 }),
});
const admin = privateKeyToAccount(keys.deployer),
  sponsor = privateKeyToAccount(keys.sponsor);
const wallet = createWalletClient({
  account: admin,
  chain,
  transport: http(config.rpcUrl),
});
if ((await client.getChainId()) !== config.chainId)
  throw new Error("Wrong chain");
for (const [name, address] of Object.entries({
  entryPoint: config.entryPoint,
  factory: config.factory,
  paymaster: config.paymaster,
  counter: config.counter,
})) {
  const { keccak256 } = await import("viem");
  const code = await client.getCode({ address });
  if (!code || keccak256(code) !== config.codeHashes[name])
    throw new Error(`Unexpected deployed code ${name}`);
}
type OperationRecord = {
  operation?: Record<string, unknown>;
  hash: Hex;
  transactionHash?: Hex;
  serializedTransaction?: Hex;
  status:
    | "preparing"
    | "submitted"
    | "succeeded"
    | "execution_failed"
    | "unknown";
  error?: string;
  blockNumber?: string;
};
type Store = {
  accounts: Address[];
  allocated: string;
  publicGasReserved?: string;
  operations: Record<string, OperationRecord>;
};
const storePath = `${runtimeDir}/service-state-${config.entryPoint.toLowerCase()}.json`;
const state: Store = existsSync(storePath)
  ? (JSON.parse(readFileSync(storePath, "utf8")) as Store)
  : { accounts: [], allocated: "0", operations: {} };
function save() {
  const temporary = storePath + ".tmp";
  const file = openSync(temporary, "w", 0o600);
  try {
    writeFileSync(file, json(state));
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  renameSync(temporary, storePath);
  const directory = openSync(runtimeDir, "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
// Conservative lifetime gas reservation across restarts. No refund means uncertain broadcasts cannot reopen budget.
function publicTransactionLimits(gas: bigint) {
  if (target === "local") return {};
  const maximumFee = 2_000_000_000n;
  state.publicGasReserved = nextPublicGasReservation(
    state.publicGasReserved ?? "0",
    gas,
  );
  save();
  return {
    gas,
    maxFeePerGas: maximumFee,
    maxPriorityFeePerGas: 1_000_000_000n,
  };
}
const challenges = new Map<string, { owner: Address; expires: number }>();
const buckets = new Map<string, { start: number; count: number }>();
let queue = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v as Address);
const hexSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .transform((v) => v as Hex);
const actionSchema = z.object({
  target: addressSchema,
  value: z
    .string()
    .regex(/^\d{1,78}$/)
    .transform(BigInt),
  data: hexSchema,
});
function reply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(json(value));
}
async function body(req: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const part of req) {
    text += String(part);
    if (Buffer.byteLength(text) > 131072) throw new Error("Body too large");
  }
  return JSON.parse(text || "{}") as unknown;
}
function allowedAccount(address: Address) {
  if (!state.accounts.some((a) => a.toLowerCase() === address.toLowerCase()))
    throw new Error("Account not enrolled");
}
async function pack(sender: Address, actions: Action[]): Promise<PackedOp> {
  allowedAccount(sender);
  const [nonce, epoch] = await Promise.all([
    client.readContract({
      address: config.entryPoint,
      abi: entryPointAbi,
      functionName: "getNonce",
      args: [sender, 0n],
    }),
    client.readContract({
      address: sender,
      abi: accountAbi,
      functionName: "epoch",
    }),
  ]);
  return makeOperation(sender, nonce, epoch, actions);
}
async function addSponsorship(op: PackedOp): Promise<PackedOp> {
  const [quotaEpoch, block] = await Promise.all([
    client.readContract({
      address: config.paymaster,
      abi: paymasterAbi,
      functionName: "quotaEpoch",
    }),
    client.getBlock(),
  ]);
  const until = Number(block.timestamp) + 300;
  op.paymasterAndData = sponsorshipData(
    config.paymaster,
    until,
    quotaEpoch,
    "0x",
  );
  const digest = await client.readContract({
    address: config.paymaster,
    abi: paymasterAbi,
    functionName: "sponsorshipDigest",
    args: [op, until, 0, quotaEpoch],
  });
  op.paymasterAndData = sponsorshipData(
    config.paymaster,
    until,
    quotaEpoch,
    await sponsor.sign({ hash: digest }),
  );
  return op;
}
async function simulate(op: PackedOp) {
  allowedAccount(op.sender);
  const hash = operationHash(op, config.entryPoint, config.chainId);
  const onchain = await client.readContract({
    address: config.entryPoint,
    abi: entryPointAbi,
    functionName: "getUserOpHash",
    args: [op],
  });
  if (hash !== onchain) throw new Error("SDK/EntryPoint hash mismatch");
  const data = encodeFunctionData({
    abi: entryPointAbi,
    functionName: "handleOps",
    args: [[op], admin.address],
  });
  await client.call({
    account: admin.address,
    to: config.entryPoint,
    data,
    gas: 10_000_000n,
  });
  const gas = await client.estimateGas({
    account: admin.address,
    to: config.entryPoint,
    data,
  });
  type Trace = {
    error?: string;
    revertReason?: string;
    logs?: { address: Address; topics: [Hex, ...Hex[]]; data: Hex }[];
    calls?: Trace[];
  };
  const trace = (await client.request({
    method: "debug_traceCall" as never,
    params: [
      {
        from: admin.address,
        to: config.entryPoint,
        data,
        gas: toHex(10_000_000n),
      },
      "latest",
      { tracer: "callTracer", tracerConfig: { withLog: true } },
    ] as never,
  })) as Trace;
  let execution: boolean | undefined;
  const reasons: string[] = [];
  function visit(frame: Trace) {
    if (frame.error) reasons.push(frame.revertReason ?? frame.error);
    for (const log of frame.logs ?? []) {
      if (log.address.toLowerCase() !== config.entryPoint.toLowerCase())
        continue;
      try {
        const event = decodeEventLog({
          abi: entryPointAbi,
          data: log.data,
          topics: log.topics,
        });
        if (
          event.eventName === "UserOperationEvent" &&
          event.args.userOpHash === hash
        )
          execution = event.args.success;
      } catch {}
    }
    for (const child of frame.calls ?? []) visit(child);
  }
  visit(trace);
  if (execution === undefined)
    throw new Error(
      "Execution simulation event unavailable; compatible debug_traceCall required",
    );
  return {
    hash,
    gas: gas.toString(),
    validation: "passed",
    execution: execution ? "passed" : "reverted",
    revertReasons: [...new Set(reasons)],
    scope: "Local debug trace simulation; actual receipt remains authoritative",
  };
}
async function reconcile(record: OperationRecord): Promise<OperationRecord> {
  if (!record.transactionHash) {
    const logs = await client.getLogs({
      address: config.entryPoint,
      event: entryPointAbi.find(
        (a) => a.type === "event" && a.name === "UserOperationEvent",
      ) as Extract<(typeof entryPointAbi)[number], { type: "event" }>,
      args: { userOpHash: record.hash },
      fromBlock: 0n,
      toBlock: "latest",
    });
    const hit = logs[0];
    if (hit) {
      record.transactionHash = hit.transactionHash;
      record.status = "submitted";
    } else {
      record.status = "unknown";
      save();
      return record;
    }
  }
  try {
    const receipt = await client.getTransactionReceipt({
      hash: record.transactionHash,
    });
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== config.entryPoint.toLowerCase())
        continue;
      try {
        const event = decodeEventLog({
          abi: entryPointAbi,
          data: log.data,
          topics: log.topics,
        });
        if (
          event.eventName === "UserOperationEvent" &&
          event.args.userOpHash === record.hash
        ) {
          record.status = event.args.success ? "succeeded" : "execution_failed";
          record.blockNumber = receipt.blockNumber.toString();
          save();
          return record;
        }
      } catch {}
    }
    if (receipt.status === "reverted") {
      record.status = "execution_failed";
      record.error = "Bundler transaction reverted";
    } else record.status = "unknown";
  } catch {
    record.status = "submitted";
  }
  save();
  return record;
}

async function submitOperation(op: PackedOp): Promise<OperationRecord> {
  return serial(async () => {
    const hash = operationHash(op, config.entryPoint, config.chainId);
    const previous = state.operations[hash];
    if (previous?.transactionHash) {
      await reconcile(previous);
      if (previous.status === "submitted" && previous.serializedTransaction) {
        // Re-broadcast identical signed bytes only. The transaction hash cannot change or duplicate a spend.
        await wallet
          .sendRawTransaction({
            serializedTransaction: previous.serializedTransaction,
          })
          .catch(() => undefined);
        await reconcile(previous);
      }
      return previous;
    }
    // With this write-ahead protocol, no hash means broadcasting has not started; preparation may safely retry.
    await simulate(op);
    const current: OperationRecord = {
      hash,
      status: "preparing",
      operation: JSON.parse(json(op)) as Record<string, unknown>,
    };
    state.operations[hash] = current;
    save();
    try {
      const request = await wallet.prepareTransactionRequest({
        to: config.entryPoint,
        data: encodeFunctionData({
          abi: entryPointAbi,
          functionName: "handleOps",
          args: [[op], admin.address],
        }),
        gas: 10_000_000n,
        ...publicTransactionLimits(10_000_000n),
      });
      current.serializedTransaction = await wallet.signTransaction(request);
      current.transactionHash = keccak256(current.serializedTransaction);
      current.status = "submitted";
      save(); // Persist the signed transaction and its known hash before any network broadcast.
      const returned = await wallet.sendRawTransaction({
        serializedTransaction: current.serializedTransaction,
      });
      if (returned !== current.transactionHash)
        throw new Error("RPC transaction hash mismatch");
      await client.waitForTransactionReceipt({
        hash: current.transactionHash,
        timeout: 20000,
      });
      return reconcile(current);
    } catch (error) {
      current.status = current.transactionHash ? "submitted" : "unknown";
      current.error =
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Submission error";
      save();
      return current;
    }
  });
}
function parseRpcOperation(value: unknown): PackedOp {
  const input = z.record(z.string(), z.unknown()).parse(value);
  const quantity = (name: string, fallback?: bigint): bigint => {
    const raw = input[name];
    if (raw === undefined && fallback !== undefined) return fallback;
    if (
      typeof raw !== "string" ||
      !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(raw)
    )
      throw new Error(`Invalid RPC quantity ${name}`);
    const number = BigInt(raw);
    if (number >= 1n << 256n) throw new Error("Quantity overflow");
    return number;
  };
  const sender = addressSchema.parse(input.sender);
  const callData = hexSchema.parse(input.callData);
  const signature = hexSchema.parse(input.signature ?? "0x");
  let initCode: Hex = "0x";
  if (input.factory) {
    initCode = concat([
      addressSchema.parse(input.factory),
      hexSchema.parse(input.factoryData ?? "0x"),
    ]);
  }
  let paymasterAndData: Hex = "0x";
  if (input.paymaster) {
    paymasterAndData = concat([
      addressSchema.parse(input.paymaster),
      toHex(quantity("paymasterVerificationGasLimit"), { size: 16 }),
      toHex(quantity("paymasterPostOpGasLimit"), { size: 16 }),
      hexSchema.parse(input.paymasterData ?? "0x"),
    ]);
  }
  return {
    sender,
    nonce: quantity("nonce"),
    initCode,
    callData,
    accountGasLimits: pack128(
      quantity("verificationGasLimit", 3_000_000n),
      quantity("callGasLimit", 1_500_000n),
    ),
    preVerificationGas: quantity("preVerificationGas", 150_000n),
    gasFees: pack128(
      quantity("maxPriorityFeePerGas"),
      quantity("maxFeePerGas"),
    ),
    paymasterAndData,
    signature,
  };
}
function rpcOperation(op: PackedOp): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(unpackOperation(op)).map(([k, v]) => [
      k,
      typeof v === "bigint" ? toHex(v) : v,
    ]),
  );
}
async function rpcReceipt(hash: Hex) {
  const record = state.operations[hash];
  if (!record) return null;
  await reconcile(record);
  if (
    !record.transactionHash ||
    !["succeeded", "execution_failed"].includes(record.status)
  )
    return null;
  const receipt = await client.getTransactionReceipt({
    hash: record.transactionHash,
  });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.entryPoint.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: entryPointAbi,
        data: log.data,
        topics: log.topics,
      });
      if (
        event.eventName === "UserOperationEvent" &&
        event.args.userOpHash === hash
      ) {
        const raw = await client.request({
          method: "eth_getTransactionReceipt",
          params: [record.transactionHash],
        });
        return {
          userOpHash: hash,
          entryPoint: config.entryPoint,
          sender: event.args.sender,
          nonce: toHex(event.args.nonce),
          paymaster: event.args.paymaster,
          actualGasCost: toHex(event.args.actualGasCost),
          actualGasUsed: toHex(event.args.actualGasUsed),
          success: event.args.success,
          logs: raw?.logs ?? [],
          receipt: raw,
        };
      }
    } catch {}
  }
  return null;
}
const rpcAllowed = new Set([
  "eth_chainId",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction",
]);
const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? "/", "http://127.0.0.1:4355");
  try {
    const key = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > 60000) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > 240) {
      reply(res, 429, { error: "Rate limit; retry after one minute" });
      return;
    }
    if (
      req.method === "POST" &&
      !["http://localhost:3155", "http://127.0.0.1:3155"].includes(
        req.headers.origin ?? "",
      )
    ) {
      reply(res, 403, { error: "Untrusted origin" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/bundler") {
      const request = z
        .object({
          jsonrpc: z.literal("2.0"),
          id: z.union([z.number(), z.string()]),
          method: z.string(),
          params: z.array(z.unknown()).default([]),
        })
        .parse(await body(req));
      try {
        let result: unknown;
        if (request.method === "eth_chainId") result = toHex(config.chainId);
        else if (request.method === "eth_supportedEntryPoints")
          result = [config.entryPoint];
        else if (
          ["eth_sendUserOperation", "eth_estimateUserOperationGas"].includes(
            request.method,
          )
        ) {
          if (
            addressSchema.parse(request.params[1]).toLowerCase() !==
            config.entryPoint.toLowerCase()
          )
            throw new Error("Unsupported EntryPoint");
          const op = parseRpcOperation(request.params[0]);
          if (request.method === "eth_sendUserOperation")
            result = (await submitOperation(op)).hash;
          else {
            await simulate(op);
            const [verificationGasLimit, callGasLimit] = unpack128(
              op.accountGasLimits,
            );
            result = {
              preVerificationGas: toHex(op.preVerificationGas),
              verificationGasLimit: toHex(verificationGasLimit),
              callGasLimit: toHex(callGasLimit),
              ...(op.paymasterAndData === "0x"
                ? {}
                : {
                    paymasterVerificationGasLimit: toHex(
                      BigInt("0x" + op.paymasterAndData.slice(42, 74)),
                    ),
                    paymasterPostOpGasLimit: toHex(
                      BigInt("0x" + op.paymasterAndData.slice(74, 106)),
                    ),
                  }),
            };
          }
        } else if (request.method === "eth_getUserOperationReceipt")
          result = await rpcReceipt(hexSchema.parse(request.params[0]));
        else if (request.method === "eth_getUserOperationByHash") {
          const record = state.operations[hexSchema.parse(request.params[0])];
          if (!record?.operation) result = null;
          else {
            await reconcile(record);
            const receipt = record.transactionHash
              ? await client
                  .getTransactionReceipt({ hash: record.transactionHash })
                  .catch(() => null)
              : null;
            result = {
              userOperation: rpcOperation(parseOperation(record.operation)),
              entryPoint: config.entryPoint,
              blockNumber: receipt ? toHex(receipt.blockNumber) : null,
              blockHash: receipt?.blockHash ?? null,
              transactionHash: record.transactionHash ?? null,
            };
          }
        } else {
          reply(res, 200, {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: "Method not supported by this local allowlisted bundler",
            },
          });
          return;
        }
        reply(res, 200, { jsonrpc: "2.0", id: request.id, result });
      } catch (error) {
        reply(res, 200, {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32500,
            message: (error instanceof Error
              ? error.message
              : "Operation rejected"
            ).slice(0, 1500),
          },
        });
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/config") {
      reply(res, 200, {
        ...config,
        rpcUrl: "/api/rpc",
        scope:
          target === "local"
            ? "Isolated local chain / allowlisted bundler"
            : "Ethereum Sepolia / allowlisted bundler",
        sponsorDeposit: await client.readContract({
          address: config.paymaster,
          abi: paymasterAbi,
          functionName: "getDeposit",
        }),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      reply(res, 200, {
        chainId: await client.getChainId(),
        block: await client.getBlockNumber(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/challenge") {
      const owner = addressSchema.parse(url.searchParams.get("owner"));
      const challenge = toHex(randomBytes(32));
      for (const [k, v] of challenges)
        if (v.expires < Date.now()) challenges.delete(k);
      if (challenges.size >= 1000)
        throw new Error("Challenge capacity reached");
      challenges.set(challenge, { owner, expires: Date.now() + 120000 });
      reply(res, 200, {
        challenge,
        message: `W05 account enrollment\nchain:${config.chainId}\nfactory:${config.factory}\nowner:${owner}\nchallenge:${challenge}`,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/accounts") {
      const data = z
        .object({
          owner: addressSchema,
          guardian: addressSchema,
          salt: hexSchema.refine((v) => v.length === 66),
          challenge: hexSchema,
          signature: hexSchema,
        })
        .parse(await body(req));
      const challenge = challenges.get(data.challenge);
      challenges.delete(data.challenge);
      if (
        !challenge ||
        challenge.expires < Date.now() ||
        challenge.owner.toLowerCase() !== data.owner.toLowerCase()
      )
        throw new Error("Expired or unknown enrollment challenge");
      const message = `W05 account enrollment\nchain:${config.chainId}\nfactory:${config.factory}\nowner:${data.owner}\nchallenge:${data.challenge}`;
      if (
        (
          await recoverMessageAddress({ message, signature: data.signature })
        ).toLowerCase() !== data.owner.toLowerCase()
      )
        throw new Error("Invalid owner proof");
      const account = await serial(async () => {
        const address = await client.readContract({
          address: config.factory,
          abi: factoryAbi,
          functionName: "getAddress",
          args: [data.owner, data.guardian, data.salt],
        });
        if (state.accounts.includes(address)) return address;
        if (
          state.accounts.length >= 10 ||
          BigInt(state.allocated) + enrollmentBudget > allocationCap
        )
          throw new Error("Local sponsorship enrollment cap reached");
        const hash = await wallet.writeContract({
          address: config.factory,
          abi: factoryAbi,
          functionName: "createAccount",
          ...publicTransactionLimits(6_000_000n),
          args: [data.owner, data.guardian, data.salt],
        });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("Account deployment failed");
        const quota = await wallet.writeContract({
          address: config.paymaster,
          abi: paymasterAbi,
          functionName: "setQuota",
          ...publicTransactionLimits(100_000n),
          args: [address, enrollmentBudget],
        });
        if (
          (await client.waitForTransactionReceipt({ hash: quota })).status !==
          "success"
        )
          throw new Error("Quota failed");
        // Local test assets only. No external faucet, wallet or network is ever used.
        if (target === "local")
          for (const a of [address, data.guardian])
            await client.request({
              method: "anvil_setBalance" as never,
              params: [a, toHex(parseEther("1"))] as never,
            });
        state.accounts.push(address);
        state.allocated = (
          BigInt(state.allocated) + enrollmentBudget
        ).toString();
        save();
        return address;
      });
      reply(res, 201, { account });
      return;
    }
    if (req.method === "GET" && url.pathname === "/account") {
      const address = addressSchema.parse(url.searchParams.get("address"));
      allowedAccount(address);
      const [
        epoch,
        threshold,
        owners,
        number,
        quota,
        balance,
        recoveryOwner,
        recoveryReadyAt,
        recoveryVotes,
      ] = await Promise.all([
        client.readContract({
          address,
          abi: accountAbi,
          functionName: "epoch",
        }),
        client.readContract({
          address,
          abi: accountAbi,
          functionName: "threshold",
        }),
        client.readContract({
          address,
          abi: accountAbi,
          functionName: "ownerList",
        }),
        client.readContract({
          address: config.counter,
          abi: counterAbi,
          functionName: "number",
        }),
        client.readContract({
          address: config.paymaster,
          abi: paymasterAbi,
          functionName: "remaining",
          args: [address],
        }),
        client.getBalance({ address }),
        client.readContract({
          address,
          abi: accountAbi,
          functionName: "recoveryOwner",
        }),
        client.readContract({
          address,
          abi: accountAbi,
          functionName: "recoveryReadyAt",
        }),
        client.readContract({
          address,
          abi: accountAbi,
          functionName: "recoveryVotes",
        }),
      ]);
      reply(res, 200, {
        address,
        epoch,
        threshold,
        owners,
        number,
        quota,
        balance,
        recoveryOwner,
        recoveryReadyAt,
        recoveryVotes,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/prepare") {
      const data = z
        .object({
          sender: addressSchema,
          actions: z.array(actionSchema).min(1).max(16),
        })
        .parse(await body(req));
      const op = await addSponsorship(await pack(data.sender, data.actions));
      reply(res, 200, {
        operation: op,
        hash: operationHash(op, config.entryPoint, config.chainId),
      });
      return;
    }
    if (
      req.method === "POST" &&
      (url.pathname === "/simulate" || url.pathname === "/submit")
    ) {
      const input = z.record(z.string(), z.unknown()).parse(await body(req));
      const op = parseOperation(input);
      if (url.pathname === "/simulate") {
        reply(res, 200, await simulate(op));
        return;
      }
      const record = await submitOperation(op);
      reply(res, 200, record);
      return;
    }
    if (req.method === "GET" && url.pathname === "/operation") {
      const hash = hexSchema.parse(url.searchParams.get("hash"));
      const record = state.operations[hash];
      if (!record) {
        reply(res, 404, { error: "Unknown operation" });
        return;
      }
      reply(res, 200, await reconcile(record));
      return;
    }
    if (req.method === "POST" && url.pathname === "/rpc") {
      const data = z
        .object({
          jsonrpc: z.literal("2.0"),
          id: z.union([z.string(), z.number()]),
          method: z.string(),
          params: z.array(z.unknown()).optional(),
        })
        .parse(await body(req));
      if (!rpcAllowed.has(data.method))
        throw new Error("RPC method not allowed");
      const result = await client.request({
        method: data.method as never,
        params: (data.params ?? []) as never,
      });
      reply(res, 200, { jsonrpc: "2.0", id: data.id, result });
      return;
    }
    reply(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const unavailable =
      error instanceof BaseError &&
      Boolean(
        error.walk(
          (cause) =>
            cause instanceof HttpRequestError || cause instanceof TimeoutError,
        ),
      );
    if (unavailable) res.setHeader("Retry-After", "5");
    reply(res, unavailable ? 503 : 400, { error: message.slice(0, 1500) });
  } finally {
    console.log(
      json({
        path: url.pathname,
        method: req.method,
        ms: Date.now() - started,
        status: res.statusCode,
      }),
    );
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(4355, "127.0.0.1", () => {
  writeFileSync(`${runtimeDir}/service.pid`, String(process.pid), {
    mode: 0o600,
  });
  console.log("W05 local allowlisted service on 127.0.0.1:4355");
});
