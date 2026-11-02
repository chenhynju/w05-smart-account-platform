import test from "node:test";
import assert from "node:assert/strict";
import {
  pack128,
  unpack128,
  makeOperation,
  parseOperation,
  json,
  operationHash,
} from "../packages/protocol.js";
import { decodeDerSignature } from "../packages/passkey.js";
const address = "0x1111111111111111111111111111111111111111" as const;
test("gas packing rejects uint128 overflow and preserves distinct halves", () => {
  const high = (1n << 128n) - 1n,
    low = 123n;
  assert.deepEqual(unpack128(pack128(high, low)), [high, low]);
  assert.throws(() => pack128(1n << 128n, 0n));
  assert.throws(() => pack128(0n, -1n));
});
test("wire operation rejects malformed hex, floating nonces and overlong fields", () => {
  const op = makeOperation(address, 0n, 1n, [
    { target: address, value: 0n, data: "0x" },
  ]);
  const wire = JSON.parse(json(op));
  assert.deepEqual(parseOperation(wire), op);
  for (const change of [
    { nonce: "1.1" },
    { sender: "0x123" },
    { signature: "0xabc" },
    { accountGasLimits: "0x" },
  ])
    assert.throws(() => parseOperation({ ...wire, ...change }));
});
test("v0.8 operation hash isolates EntryPoint, sender, nonce and calldata", () => {
  const op = makeOperation(address, 0n, 1n, [
    { target: address, value: 0n, data: "0x" },
  ]);
  const entry = "0x2222222222222222222222222222222222222222";
  const hash = operationHash(op, entry);
  assert.notEqual(operationHash({ ...op, nonce: 1n }, entry), hash);
  assert.notEqual(operationHash({ ...op, sender: entry }, entry), hash);
  assert.notEqual(operationHash(op, address), hash);
  assert.notEqual(operationHash({ ...op, callData: "0x1234" }, entry), hash);
});
test("DER parser normalizes valid scalars and rejects malformed encodings", () => {
  const valid = Uint8Array.from([0x30, 6, 2, 1, 1, 2, 1, 2]);
  const result = decodeDerSignature(valid);
  assert.equal(BigInt(result.r), 1n);
  assert.equal(BigInt(result.s), 2n);
  for (const data of [
    [],
    [0x30, 1, 0],
    [0x30, 6, 2, 1, 0x80, 2, 1, 1],
    [0x30, 7, 2, 2, 0, 1, 2, 1, 2],
    [0x30, 6, 2, 1, 0, 2, 1, 2],
  ])
    assert.throws(() => decodeDerSignature(Uint8Array.from(data)));
});
