const { chromium } = require("playwright");
const {
  createPublicClient,
  http,
  parseAbi,
  decodeAbiParameters,
  concat,
  hexToBytes,
} = require("viem");
const { createHash, createPublicKey, verify } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const outputBase =
  process.env.W05_DIAG_DIR || path.resolve("evidence/passkey-diagnostics");
fs.mkdirSync(outputBase, { recursive: true });
const output = path.join(outputBase, String(Date.now()));
fs.mkdirSync(output);
fs.writeFileSync(
  path.join(outputBase, "latest-run.json"),
  JSON.stringify({ path: output }),
);
const origin = "http://localhost:3155";
const abi = parseAbi([
  "function passkeyX() view returns(bytes32)",
  "function passkeyY() view returns(bytes32)",
  "function rpIdHash() view returns(bytes32)",
  "function passkeyOrigin() view returns(string)",
  "function passkeyEpoch() view returns(uint256)",
  "function epoch() view returns(uint256)",
  "function verifyPasskey(bytes32 hash,bytes signature) view returns(bool)",
]);
const client = createPublicClient({
  transport: http(origin + "/api/rpc", {
    fetchOptions: { headers: { origin } },
  }),
});
const authType = {
  type: "tuple",
  components: [
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
    { name: "challengeIndex", type: "uint256" },
    { name: "typeIndex", type: "uint256" },
    { name: "authenticatorData", type: "bytes" },
    { name: "clientDataJSON", type: "string" },
  ],
};
const bytes = (h) => Buffer.from(h.slice(2), "hex");
const sha = (b) => createHash("sha256").update(b).digest();
const json = (value) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
(async () => {
  const browser = process.env.W05_CDP_URL
    ? await chromium.connectOverCDP(process.env.W05_CDP_URL)
    : await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
        headless: true,
      });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const records = [];
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Create smart account" }).click();
    await page
      .getByText(
        "Account deployed. Its owner, guardian and gas budget are recorded on the local chain.",
      )
      .waitFor();
    const address = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("w05.local.keys")).account,
    ); // Public address only: never export test signing keys.
    await page
      .getByRole("button", { name: "Access & recovery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Register passkey", exact: true })
      .click();
    await page
      .getByText(
        "Confirmed: the UserOperation event reports successful execution.",
      )
      .waitFor();
    const x = await client.readContract({
        address,
        abi,
        functionName: "passkeyX",
      }),
      y = await client.readContract({ address, abi, functionName: "passkeyY" }),
      rp = await client.readContract({
        address,
        abi,
        functionName: "rpIdHash",
      }),
      configuredOrigin = await client.readContract({
        address,
        abi,
        functionName: "passkeyOrigin",
      });
    const config = await (await fetch(origin + "/api/config")).json();
    const epAbi = JSON.parse(
      fs.readFileSync("out/EntryPoint.sol/EntryPoint.json", "utf8"),
    ).abi;
    const publicKey = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: bytes(x).toString("base64url"),
        y: bytes(y).toString("base64url"),
      },
      format: "jwk",
    });
    const publicConfig = { address, x, y, rp, configuredOrigin };
    fs.writeFileSync(
      path.join(output, "public-config.json"),
      json(publicConfig),
    );
    for (let i = 0; i < Number(process.env.W05_DIAG_ROUNDS || 32); i++) {
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await page.getByRole("button", { name: /^Prepare operation/ }).click();
      await page
        .getByRole("button", { name: "Approve with passkey", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Submit operation", exact: true })
        .waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const buttons = [...document.querySelectorAll("button")];
        const b = buttons.find(
          (b) => b.textContent.trim() === "Submit operation",
        );
        return b && !b.disabled;
      });
      const op = JSON.parse(await page.locator("details pre").textContent());
      const hash = await page.locator(".review-grid code").first().innerText();
      const signature = "0x" + op.signature.slice(4);
      const [auth] = decodeAbiParameters([authType], signature);
      const authData = bytes(auth.authenticatorData),
        message = Buffer.concat([
          authData,
          sha(Buffer.from(auth.clientDataJSON)),
        ]);
      const nodeValid = verify(
        "sha256",
        message,
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.concat([bytes(auth.r), bytes(auth.s)]),
      );
      const clientJson = JSON.parse(auth.clientDataJSON);
      const flags = authData[32];
      const expectedJson = JSON.stringify({
        type: "webauthn.get",
        challenge: bytes(hash).toString("base64url"),
        origin: configuredOrigin,
        crossOrigin: false,
      });
      let chainValid = false,
        chainError;
      try {
        chainValid = await client.readContract({
          address,
          abi,
          functionName: "verifyPasskey",
          args: [hash, signature],
          gas: 20_000_000n,
        });
      } catch (e) {
        chainError = e.shortMessage || e.message;
      }
      const packed = {
        ...op,
        nonce: BigInt(op.nonce),
        preVerificationGas: BigInt(op.preVerificationGas),
      };
      const chainHash = await client.readContract({
        address: config.entryPoint,
        abi: epAbi,
        functionName: "getUserOpHash",
        args: [packed],
      });
      const simulation = await fetch(origin + "/api/simulate", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(op),
      });
      const simulated = await simulation.json();
      const record = {
        round: i,
        chainHash,
        hashMatches: hash === chainHash,
        simulationOK: simulation.ok,
        simulation: simulated,
        ...publicConfig,
        hash,
        op,
        auth,
        nodeValid,
        chainValid,
        chainError,
        flags,
        rpMatches: authData.subarray(0, 32).equals(bytes(rp)),
        challengeMatches:
          clientJson.challenge === bytes(hash).toString("base64url"),
        jsonMatches: auth.clientDataJSON === expectedJson,
        hasUP: !!(flags & 1),
        hasUV: !!(flags & 4),
      };
      records.push(record);
      fs.writeFileSync(path.join(output, `assertion-${i}.json`), json(record));
      console.log(
        json({
          round: i,
          nodeValid,
          chainValid,
          hashMatches: record.hashMatches,
          simulationOK: record.simulationOK,
          flags,
          jsonMatches: record.jsonMatches,
          rpMatches: record.rpMatches,
          challengeMatches: record.challengeMatches,
        }),
      );
      if (!chainValid || !record.hashMatches || !record.simulationOK) {
        await page.screenshot({
          path: path.join(output, "failure.png"),
          fullPage: true,
        });
        break;
      }
    }
  } finally {
    fs.writeFileSync(
      path.join(output, "summary.json"),
      json(
        records.map(
          ({
            round,
            nodeValid,
            chainValid,
            simulationOK,
            hashMatches,
            flags,
            jsonMatches,
            rpMatches,
            challengeMatches,
          }) => ({
            round,
            nodeValid,
            chainValid,
            simulationOK,
            hashMatches,
            flags,
            jsonMatches,
            rpMatches,
            challengeMatches,
          }),
        ),
      ),
    );
    await context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
