import { createBundlerClient } from "viem/account-abstraction";
import { unpackOperation } from "../../packages/protocol.js";
import { request as httpRequest } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import {
  concat,
  decodeAbiParameters,
  encodeFunctionData,
  createPublicClient,
  http,
  type Hex,
  type Address,
} from "viem";
import { anvil } from "viem/chains";
import {
  entryPointAbi,
  counterAbi,
  parseOperation,
  operationHash,
  json,
  type PackedOp,
  type Deployment,
} from "../../packages/protocol.js";
const base = "http://127.0.0.1:4355";
const origin = "http://localhost:3155";
const config = JSON.parse(
  readFileSync(".runtime/deployment.json", "utf8"),
) as Deployment;
const keys = JSON.parse(readFileSync(".runtime/keys.json", "utf8")) as {
  owner: Hex;
  guardian: Hex;
  sponsor: Hex;
};
const owner = privateKeyToAccount(keys.owner),
  guardian = privateKeyToAccount(keys.guardian);
const client = createPublicClient({
  chain: anvil,
  transport: http(config.rpcUrl),
});
async function api(path: string, data?: unknown) {
  const response = await fetch(
    base + "/" + path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: json(data),
        },
  );
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(result.error));
  return result;
}
let account: Address;
async function prepared(
  actions: { target: Address; value: bigint; data: Hex }[],
): Promise<PackedOp> {
  const result = await api("prepare", { sender: account, actions });
  return parseOperation(result.operation as Record<string, unknown>);
}
async function signed(op: PackedOp): Promise<PackedOp> {
  return {
    ...op,
    signature: concat([
      "0x00",
      await owner.sign({ hash: operationHash(op, config.entryPoint) }),
    ]),
  };
}
test("local service real chain lifecycle and hostile requests", async (t) => {
  const challenge = await api(`challenge?owner=${owner.address}`);
  const proof = await owner.signMessage({
    message: challenge.message as string,
  });
  const created = await api("accounts", {
    owner: owner.address,
    guardian: guardian.address,
    salt: "0x" + "00".repeat(32),
    challenge: challenge.challenge,
    signature: proof,
  });
  account = created.account as Address;
  await t.test("enrollment challenge cannot be replayed", async () => {
    await assert.rejects(
      api("accounts", {
        owner: owner.address,
        guardian: guardian.address,
        salt: "0x" + "00".repeat(32),
        challenge: challenge.challenge,
        signature: proof,
      }),
      /Expired or unknown/,
    );
  });
  await t.test(
    "fresh sponsorship uses the pending clock even when the head is stale",
    async () => {
      const latest = await client.getBlock({ blockTag: "latest" });
      const pending = await client.getBlock({ blockTag: "pending" });
      const nextTimestamp =
        (pending.timestamp > latest.timestamp
          ? pending.timestamp
          : latest.timestamp) + 600n;
      await client.request({
        method: "evm_setNextBlockTimestamp" as never,
        params: [Number(nextTimestamp)] as never,
      });
      const op = await signed(
        await prepared([
          {
            target: config.counter,
            value: 0n,
            data: encodeFunctionData({
              abi: counterAbi,
              functionName: "increment",
              args: [1n],
            }),
          },
        ]),
      );
      const packed = unpackOperation(op);
      assert(packed.paymasterData);
      const [until] = decodeAbiParameters(
        [
          { type: "uint48" },
          { type: "uint48" },
          { type: "uint256" },
          { type: "bytes" },
        ],
        packed.paymasterData,
      );
      assert.equal(BigInt(until), nextTimestamp + 300n);
      await api("simulate", op);
      writeFileSync(
        "evidence/pending-clock-sponsorship.json",
        json({
          latest: latest.timestamp,
          previousPending: pending.timestamp,
          nextTimestamp,
          until,
          scope:
            "Local future pending block without mining; real signed operation simulation",
          status: "PASS",
        }) + "\n",
      );
      await client.request({
        method: "evm_mine" as never,
        params: [] as never,
      });
    },
  );
  const initial = await api(`account?address=${account}`);
  const op = await signed(
    await prepared([
      {
        target: config.counter,
        value: 0n,
        data: encodeFunctionData({
          abi: counterAbi,
          functionName: "increment",
          args: [3n],
        }),
      },
    ]),
  );
  await t.test(
    "SDK hash equals deployed EntryPoint v0.8 EIP712 hash",
    async () => {
      assert.equal(
        operationHash(op, config.entryPoint),
        await client.readContract({
          address: config.entryPoint,
          abi: entryPointAbi,
          functionName: "getUserOpHash",
          args: [op],
        }),
      );
    },
  );
  await t.test(
    "signed operation simulation and submission reconcile actual event",
    async () => {
      const simulated = await api("simulate", op);
      assert.equal(simulated.validation, "passed");
      const result = await api("submit", op);
      assert.equal(result.status, "succeeded");
      const next = await api(`account?address=${account}`);
      assert.equal(
        BigInt(next.number as string),
        BigInt(initial.number as string) + 3n,
      );
      const again = await api("submit", op);
      assert.equal(again.transactionHash, result.transactionHash);
      assert.equal(
        (await api(`account?address=${account}`)).number,
        next.number,
      );
    },
  );
  await t.test("wrong owner signature rejected before broadcast", async () => {
    const bad = await prepared([
      {
        target: config.counter,
        value: 0n,
        data: encodeFunctionData({
          abi: counterAbi,
          functionName: "increment",
          args: [100n],
        }),
      },
    ]);
    bad.signature = concat([
      "0x00",
      await guardian.sign({ hash: operationHash(bad, config.entryPoint) }),
    ]);
    await assert.rejects(api("submit", bad));
  });
  await t.test(
    "batch reversion is diagnosed and target state stays atomic",
    async () => {
      const before = await api(`account?address=${account}`);
      const bad = await signed(
        await prepared([
          {
            target: config.counter,
            value: 0n,
            data: encodeFunctionData({
              abi: counterAbi,
              functionName: "increment",
              args: [1000n],
            }),
          },
          {
            target: config.counter,
            value: 0n,
            data: encodeFunctionData({ abi: counterAbi, functionName: "fail" }),
          },
        ]),
      );
      const simulation = await api("simulate", bad);
      assert.equal(simulation.execution, "reverted");
      writeFileSync("evidence/batch-simulation.json", json(simulation) + "\n");
      const included = await api("submit", bad);
      assert.equal(included.status, "execution_failed");
      assert.equal(
        (await api(`account?address=${account}`)).number,
        before.number,
      );
    },
  );
  await t.test("CSRF and arbitrary RPC administration blocked", async () => {
    const response = await fetch(base + "/prepare", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 403);
    await assert.rejects(
      api("rpc", {
        jsonrpc: "2.0",
        id: 1,
        method: "anvil_setBalance",
        params: [account, "0x100"],
      }),
      /not allowed/,
    );
  });
  await t.test("malformed wire payload fails safely", async () => {
    await assert.rejects(
      api("submit", { sender: account, nonce: "1.5" }),
      /Invalid/,
    );
  });

  await t.test(
    "viem BundlerClient interoperates with local ERC-4337 JSON-RPC",
    async () => {
      const bundler = createBundlerClient({
        chain: anvil,
        transport: http(base + "/bundler", {
          fetchOptions: { headers: { origin } },
        }),
      });
      const supported = await bundler.getSupportedEntryPoints();
      assert.equal(supported[0].toLowerCase(), config.entryPoint.toLowerCase());
      const op = await signed(
        await prepared([
          {
            target: config.counter,
            value: 0n,
            data: encodeFunctionData({
              abi: counterAbi,
              functionName: "increment",
              args: [2n],
            }),
          },
        ]),
      );
      const hash = await bundler.sendUserOperation({
        ...unpackOperation(op),
        entryPointAddress: config.entryPoint,
      });
      assert.equal(hash, operationHash(op, config.entryPoint));
      const receipt = await bundler.getUserOperationReceipt({ hash });
      assert.equal(receipt.success, true);
      assert(receipt.actualGasUsed > 0n);
      assert.equal(receipt.receipt.status, "success");
      const byHash = await bundler.getUserOperation({ hash });
      assert.equal(byHash.userOperation.nonce, op.nonce);
      writeFileSync(
        "evidence/bundler-interop.json",
        json({ method: "viem BundlerClient", hash, receipt, status: "PASS" }) +
          "\n",
      );
    },
  );
  await t.test(
    "lost HTTP response does not cause duplicate execution",
    async () => {
      const before = await api(`account?address=${account}`);
      const op = await signed(
        await prepared([
          {
            target: config.counter,
            value: 0n,
            data: encodeFunctionData({
              abi: counterAbi,
              functionName: "increment",
              args: [4n],
            }),
          },
        ]),
      );
      const wire = json(op);
      const hash = operationHash(op, config.entryPoint);
      await new Promise<void>((resolve) => {
        const request = httpRequest(
          base + "/submit",
          {
            method: "POST",
            headers: {
              origin,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(wire),
            },
          },
          (response) => {
            response.destroy();
            resolve();
          },
        );
        request.on("error", () => resolve());
        request.end(wire);
        // Drop the response after the server has received the request; chain truth is subsequently reconciled.
        request.on("finish", () =>
          setTimeout(
            () => request.destroy(new Error("Intentional client disconnect")),
            25,
          ),
        );
      });
      let result: Record<string, unknown> | undefined;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          result = await api(`operation?hash=${hash}`);
          if (result.status === "succeeded") break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(result?.status, "succeeded");
      const repeated = await api("submit", op);
      assert.equal(repeated.transactionHash, result?.transactionHash);
      assert.equal(
        BigInt((await api(`account?address=${account}`)).number as string),
        BigInt(before.number as string) + 4n,
      );
      writeFileSync(
        "evidence/disconnect-recovery.json",
        json({
          hash,
          transactionHash: result?.transactionHash,
          delta: 4,
          status: "PASS",
        }) + "\n",
      );
    },
  );
  writeFileSync(
    "evidence/service-acceptance.json",
    json({
      account,
      chainId: 31337,
      status: "PASS",
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
});
