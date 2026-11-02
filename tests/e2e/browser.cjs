const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
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
  const artifactDir =
    process.env.W05_E2E_OUTPUT_DIR || path.resolve("evidence/browser");
  fs.mkdirSync(artifactDir, { recursive: true });
  const errors = [];
  const evidence = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const record = (name) => {
    evidence.push({ name, status: "PASS", at: new Date().toISOString() });
    console.log("PASS " + name);
  };
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
    await page.goto("http://localhost:3155", {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await page.getByRole("button", { name: "Create smart account" }).click();
    await page
      .getByText(
        "Account deployed. Its owner, guardian and gas budget are recorded on the local chain.",
      )
      .waitFor();
    record("Browser owner proof → factory deployment → account state");
    const initial = BigInt(await page.getByTestId("counter-value").innerText());
    async function prepare() {
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await page.getByRole("button", { name: /^Prepare operation/ }).click();
      await page.getByRole("heading", { name: "Operation review" }).waitFor();
    }
    async function submit() {
      await page
        .getByRole("button", { name: "Submit operation", exact: true })
        .click();
      await page
        .getByText(
          "Confirmed: the UserOperation event reports successful execution.",
        )
        .waitFor();
    }
    await prepare();
    await page
      .getByRole("button", { name: "Approve as owner", exact: true })
      .click();
    await page.getByRole("button", { name: "Simulate", exact: true }).click();
    await page.getByText("Validation passed. passed").waitFor();
    await submit();
    record(
      "Owner signature → real simulation → sponsored EntryPoint execution → receipt UI",
    );
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    assert.equal(
      BigInt(await page.getByTestId("counter-value").innerText()),
      initial + 1n,
    );
    await page
      .getByRole("checkbox", { name: "Add a second call to the atomic batch" })
      .check();
    await prepare();
    await page
      .getByRole("button", { name: "Approve as owner", exact: true })
      .click();
    await submit();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    assert.equal(
      BigInt(await page.getByTestId("counter-value").innerText()),
      initial + 3n,
    );
    record(
      "Atomic two-call batch succeeds through UI and changes chain counter twice",
    );
    await page
      .getByRole("checkbox", { name: "Make the second call revert" })
      .check();
    await prepare();
    await page
      .getByRole("button", { name: "Approve as owner", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit operation", exact: true })
      .click();
    await page
      .locator('.message.error[role="alert"]')
      .filter({ hasText: /revert|fail/i })
      .waitFor();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    assert.equal(
      BigInt(await page.getByTestId("counter-value").innerText()),
      initial + 3n,
    );
    record(
      "Second-call failure rolls back first-call state through complete UI lifecycle",
    );
    await page
      .getByRole("checkbox", { name: "Add a second call to the atomic batch" })
      .uncheck();
    await page
      .getByRole("button", { name: "Access & recovery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create session key", exact: true })
      .click();
    await page
      .getByText(
        "Confirmed: the UserOperation event reports successful execution.",
      )
      .waitFor();
    await prepare();
    await page
      .getByRole("button", { name: "Use session key", exact: true })
      .click();
    await submit();
    record("Scoped session-key configuration and actual session operation");
    await page
      .getByRole("button", { name: "Access & recovery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Revoke session", exact: true })
      .click();
    await page
      .getByText(
        "Confirmed: the UserOperation event reports successful execution.",
      )
      .waitFor();
    await prepare();
    await page
      .getByRole("button", { name: "Use session key", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit operation", exact: true })
      .click();
    await page.locator('.message.error[role="alert"]').waitFor();
    record("Revoked session signature rejected by chain validation");
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
      .waitFor({ timeout: 60000 });
    await prepare();
    await page
      .getByRole("button", { name: "Approve with passkey", exact: true })
      .click();
    await submit();
    record(
      "Chromium WebAuthn enrollment → real P256 assertion → on-chain WebAuthn verification",
    );
    let extensionAssertions = 0;
    for (let n = 0; n < 12; n++) {
      await prepare();
      await page
        .getByRole("button", { name: "Approve with passkey", exact: true })
        .click();
      const operation = await page.locator("details pre").first().textContent();
      if (operation && operation.includes("6f746865725f6b657973"))
        extensionAssertions++;
      await submit();
    }
    record(
      "12 further independent browser Passkey assertions submitted without retrying failures",
    );
    evidence.push({
      name: "Chrome extension assertions observed",
      count: extensionAssertions,
      status: "OBSERVED",
    });

    await page
      .getByRole("button", { name: "Access & recovery", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Replacement owner" })
      .fill("0x2222222222222222222222222222222222222222");
    await page
      .getByRole("button", { name: "Propose as guardian", exact: true })
      .click();
    await page.getByText(/Guardian proposal submitted/).waitFor();
    await page
      .getByRole("button", { name: "Cancel recovery", exact: true })
      .click();
    await page
      .getByText(
        "Confirmed: the UserOperation event reports successful execution.",
      )
      .waitFor();
    record("Guardian transaction and owner-authorized recovery cancellation");
    await page
      .getByRole("button", { name: "Enable 2-of-2 policy", exact: true })
      .click();
    await page
      .getByText(
        "Confirmed: the UserOperation event reports successful execution.",
      )
      .waitFor();
    await prepare();
    await page
      .getByRole("button", { name: "Approve as owner", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit operation", exact: true })
      .click();
    await page.locator('.message.error[role="alert"]').waitFor();
    record(
      "Threshold policy rejects an operation with only one owner approval",
    );
    await page
      .getByRole("button", { name: "Approve as cosigner", exact: true })
      .click();
    await submit();
    record(
      "Two distinct approval actions → sorted threshold signature → successful execution",
    );
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    assert.equal(
      BigInt(await page.getByTestId("counter-value").innerText()),
      initial + 18n,
    );
    await page.screenshot({
      path: path.join(artifactDir, "W05-overview.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Security", exact: true }).click();
    await page.screenshot({
      path: path.join(artifactDir, "W05-security.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(artifactDir, "W05-mobile.png"),
      fullPage: true,
    });
    record("390px responsive layout without horizontal overflow");
    assert.deepEqual(errors, []);
    record("No browser page exceptions");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "Access & recovery", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Replacement owner" })
      .fill("0x2222222222222222222222222222222222222222");
    await page
      .getByRole("button", { name: "Propose as guardian", exact: true })
      .click();
    await page.getByText(/Guardian proposal submitted/).waitFor();
    await page
      .getByRole("button", {
        name: "Complete recovery after delay",
        exact: true,
      })
      .click();
    await page.locator('.message.error[role="alert"]').waitFor();
    record("Recovery completion before on-chain delay rejected in browser");
    const rpc = async (method, params) => {
      const response = await fetch("http://127.0.0.1:18555", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const result = await response.json();
      if (result.error) throw new Error(JSON.stringify(result.error));
      return result.result;
    };
    await rpc("evm_increaseTime", [172801]);
    await rpc("evm_mine", []);
    await page
      .getByRole("button", {
        name: "Complete recovery after delay",
        exact: true,
      })
      .click();
    await page.getByText(/Recovery transaction submitted/).waitFor();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page.getByText("0x222222…222222", { exact: true }).first().waitFor();
    await prepare();
    await page
      .getByRole("button", { name: "Approve as owner", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve as cosigner", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit operation", exact: true })
      .click();
    await page.locator('.message.error[role="alert"]').waitFor();
    record(
      "Guardian completes after local two-day time advance; previous owners lose authorization",
    );
  } catch (error) {
    await page.screenshot({
      path: path.join(artifactDir, "failure.png"),
      fullPage: true,
    });
    evidence.push({ name: String(error), status: "FAIL" });
    throw error;
  } finally {
    fs.writeFileSync(
      path.join(artifactDir, "evidence.json"),
      JSON.stringify(
        {
          scope:
            "Chromium with virtual CTAP2 authenticator, local Anvil chain. No physical authenticator or public network tested.",
          evidence,
          errors,
        },
        null,
        2,
      ),
    );
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
