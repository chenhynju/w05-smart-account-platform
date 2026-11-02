import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionValidUntil,
  networkFor,
  validateEndpoint,
  nextPublicGasReservation,
} from "../packages/network.js";
import {
  makeOperation,
  operationHash,
  operationTypedData,
} from "../packages/protocol.js";
test("network profiles reject mainnet, wrong local RPC and insecure public RPC", () => {
  assert.equal(networkFor(11155111).name, "Sepolia");
  assert.throws(() => networkFor(1));
  assert.throws(() => validateEndpoint(31337, "https://example.com"));
  assert.throws(() => validateEndpoint(11155111, "http://example.com"));
  assert.throws(() =>
    validateEndpoint(11155111, "https://user:secret@example.com"),
  );
  validateEndpoint(31337, "http://127.0.0.1:18555");
  validateEndpoint(11155111, "https://ethereum-sepolia-rpc.publicnode.com");
});
test("the same UserOperation has distinct Anvil and Sepolia domains", () => {
  const address = "0x1111111111111111111111111111111111111111" as const;
  const op = makeOperation(address, 0n, 1n, [
    { target: address, value: 0n, data: "0x" },
  ]);
  assert.notEqual(
    operationHash(op, address, 31337),
    operationHash(op, address, 11155111),
  );
  assert.equal(
    operationTypedData(op, address, 11155111).domain?.chainId,
    11155111,
  );
  assert.equal(operationHash(op, address), operationHash(op, address, 31337));
});

test("public gas budget survives serialization and rejects the first overspend", () => {
  let state = { reserved: "0" };
  for (let i = 0; i < 25; i++) {
    state = JSON.parse(
      JSON.stringify({
        reserved: nextPublicGasReservation(state.reserved, 10_000_000n),
      }),
    );
  }
  assert.equal(state.reserved, "500000000000000000");
  assert.throws(() => nextPublicGasReservation(state.reserved, 1n));
  assert.throws(() => nextPublicGasReservation("0", -1n));
  assert.throws(() => nextPublicGasReservation("0", 10_000_001n));
  assert.throws(() => nextPublicGasReservation("-1", 1n));
});

test("session policy follows a chain two days ahead, with exact uint48 bounds", () => {
  const chainTime = 1_793_817_600n;
  const hostTime = chainTime - 172800n;
  const expiry = BigInt(sessionValidUntil(chainTime));
  assert.equal(expiry - chainTime, 3600n);
  assert(expiry > hostTime + 172800n);
  assert.equal(
    BigInt(sessionValidUntil((1n << 48n) - 3601n)),
    (1n << 48n) - 1n,
  );
  assert.throws(() => sessionValidUntil((1n << 48n) - 3600n));
  assert.throws(() => sessionValidUntil(-1n));
});
