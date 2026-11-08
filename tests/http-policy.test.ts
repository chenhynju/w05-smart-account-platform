import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationOrigins,
  serviceEndpoint,
  proxyToken,
} from "../packages/http-policy.js";

test("local hosting keeps exact loopback origins and service endpoint", () => {
  assert.deepEqual(applicationOrigins({}), [
    "http://localhost:3155",
    "http://127.0.0.1:3155",
  ]);
  assert.equal(serviceEndpoint({}).origin, "http://127.0.0.1:4355");
  assert.equal(proxyToken({}), undefined);
});
test("public profiles fail closed without explicit deployment configuration", () => {
  for (const env of [
    { W05_NETWORK: "sepolia" },
    { NEXT_PUBLIC_W05_NETWORK: "sepolia" },
  ]) {
    assert.throws(() => applicationOrigins(env));
    assert.throws(() => serviceEndpoint(env));
    assert.throws(() => proxyToken(env));
    assert.throws(() => proxyToken({ ...env, W05_PROXY_TOKEN: "short" }));
  }
});
test("deployment policy rejects credentials, HTTP, wildcard/path and origin confusion", () => {
  for (const value of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com/",
    "https://example.com?x=1",
    "https://example.com#fragment",
    "https://*.example.com",
  ]) {
    assert.throws(() => applicationOrigins({ W05_APP_ORIGIN: value }), value);
    assert.throws(() => serviceEndpoint({ W05_SERVICE_URL: value }), value);
  }
  const env = {
    W05_NETWORK: "sepolia",
    W05_APP_ORIGIN: "https://wallet.example.com",
    W05_SERVICE_URL: "https://service.example.com",
    W05_PROXY_TOKEN: "x".repeat(32),
  };
  assert.deepEqual(applicationOrigins(env), [env.W05_APP_ORIGIN]);
  assert.equal(serviceEndpoint(env).origin, env.W05_SERVICE_URL);
  assert.equal(proxyToken(env), env.W05_PROXY_TOKEN);
});
