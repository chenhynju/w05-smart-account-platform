"use client";
import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useSignMessage,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  concat,
  encodeFunctionData,
  keccak256,
  toHex,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { webChain } from "../../../packages/network";
import {
  accountAbi,
  counterAbi,
  operationTypedData,
  parseOperation,
  json,
  type Deployment,
  type PackedOp,
  type Action,
} from "../../../packages/protocol";
import { registerPasskey, signWithPasskey } from "../../../packages/passkey";
import { Providers } from "./providers";
type LocalKeys = {
  owner: Hex;
  guardian: Hex;
  session?: Hex;
  cosigner?: Hex;
  credentialId?: string;
  account?: Address;
};
type Snapshot = {
  epoch: string;
  threshold: string;
  owners: Address[];
  number: string;
  quota: string;
  balance: string;
  recoveryOwner: Address;
  recoveryReadyAt: number;
  recoveryVotes: string;
};
type Draft = { op: PackedOp; hash: Hex; approvals: Record<string, Hex> };
type Receipt = {
  hash: Hex;
  status: string;
  transactionHash?: Hex;
  error?: string;
  blockNumber?: string;
};
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: json(data),
        },
  );
  const value = (await response.json()) as T & { error?: string };
  if (
    path === "config" &&
    (value as unknown as Deployment).chainId !== webChain.id
  )
    throw new Error("Web build and service network do not match");
  if (!response.ok) throw new Error(value.error ?? "Request failed");
  return value;
}
const short = (v: string | undefined) =>
  v ? `${v.slice(0, 8)}…${v.slice(-6)}` : "—";
const eth = (v: string | undefined) => (Number(v ?? 0) / 1e18).toFixed(5);
function App() {
  const [config, setConfig] = useState<Deployment>();
  const [keys, setKeys] = useState<LocalKeys>();
  const [account, setAccount] = useState<Address>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [tab, setTab] = useState("Overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [amount, setAmount] = useState("1");
  const [batch, setBatch] = useState(false);
  const [fail, setFail] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [rawActions, setRawActions] = useState("");
  const injectedAccount = useAccount();
  const connection = useConnect();
  const messageSigner = useSignMessage();
  const typedSigner = useSignTypedData();
  const chainSwitch = useSwitchChain();
  function persist(next: LocalKeys) {
    sessionStorage.setItem(
      webChain.id === 31337 ? "w05.local.keys" : "w05.sepolia.keys",
      JSON.stringify(next),
    );
    setKeys(next);
  }
  async function refresh(address = account) {
    if (address) setSnapshot(await api<Snapshot>(`account?address=${address}`));
  }
  useEffect(() => {
    void api<Deployment>("config")
      .then(setConfig)
      .catch((e) => setError(String(e)));
    try {
      const stored = sessionStorage.getItem(
        webChain.id === 31337 ? "w05.local.keys" : "w05.sepolia.keys",
      );
      if (stored) {
        const k = JSON.parse(stored) as LocalKeys;
        setKeys(k);
        setAccount(k.account);
        if (k.account)
          void api<Snapshot>(`account?address=${k.account}`)
            .then(setSnapshot)
            .catch((e) => setError(String(e)));
      }
    } catch {
      setError("Could not restore local wallet");
    }
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!config) return;
    let k = keys;
    if (!k) {
      k = { owner: generatePrivateKey(), guardian: generatePrivateKey() };
      persist(k);
    }
    const owner =
      injectedAccount.address ?? privateKeyToAccount(k.owner).address;
    const guardian = privateKeyToAccount(k.guardian).address;
    const challenge = await api<{ challenge: Hex; message: string }>(
      `challenge?owner=${owner}`,
    );
    const signature = injectedAccount.address
      ? await messageSigner.signMessageAsync({
          message: challenge.message,
          account: injectedAccount.address,
        })
      : await privateKeyToAccount(k.owner).signMessage({
          message: challenge.message,
        });
    const result = await api<{ account: Address }>("accounts", {
      owner,
      guardian,
      salt: keccak256(toHex(crypto.getRandomValues(new Uint8Array(32)))),
      challenge: challenge.challenge,
      signature,
    });
    persist({ ...k, account: result.account });
    setAccount(result.account);
    await refresh(result.account);
    setNotice(
      "Account deployed. Its owner, guardian and gas budget are recorded on the local chain.",
    );
  }
  async function prepare(actions: Action[]) {
    if (!account) throw new Error("Create an account first");
    const result = await api<{ operation: Record<string, unknown>; hash: Hex }>(
      "prepare",
      { sender: account, actions },
    );
    const d = {
      op: parseOperation(result.operation),
      hash: result.hash,
      approvals: {},
    };
    setDraft(d);
    return d;
  }
  async function approve(
    d: Draft,
    role: "owner" | "cosigner" | "session" | "passkey",
  ): Promise<Draft> {
    if (!config || !keys) throw new Error("Wallet unavailable");
    let signature: Hex;
    let address: string;
    if (role === "passkey") {
      if (!keys.credentialId) throw new Error("Register a passkey first");
      signature = await signWithPasskey(keys.credentialId, d.hash);
      const next = {
        ...d,
        op: { ...d.op, signature: concat(["0x02", signature]) },
      };
      setDraft(next);
      return next;
    }
    if (role === "owner" && injectedAccount.address) {
      if (injectedAccount.chainId !== config.chainId) {
        await chainSwitch.switchChainAsync({ chainId: webChain.id });
      }
      address = injectedAccount.address;
      signature = await typedSigner.signTypedDataAsync({
        ...operationTypedData(d.op, config.entryPoint, config.chainId),
        account: injectedAccount.address,
      });
    } else {
      const key = keys[role];
      if (!key) throw new Error(`Missing ${role} key`);
      const signer = privateKeyToAccount(key);
      address = signer.address;
      signature = await signer.sign({ hash: d.hash });
    }
    if (role === "session") {
      const next = {
        ...d,
        op: { ...d.op, signature: concat(["0x01", signature]) },
      };
      setDraft(next);
      return next;
    }
    const approvals = { ...d.approvals, [address.toLowerCase()]: signature };
    const ordered = Object.entries(approvals).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const next = {
      ...d,
      approvals,
      op: {
        ...d.op,
        signature: concat(["0x00", ...ordered.map(([, s]) => s)]),
      },
    };
    setDraft(next);
    return next;
  }
  async function submit(d: Draft) {
    const result = await api<Receipt>("submit", d.op);
    setReceipts((previous) => [
      result,
      ...previous.filter((p) => p.hash !== result.hash),
    ]);
    await refresh();
    if (result.status === "succeeded") {
      setNotice(
        "Confirmed: the UserOperation event reports successful execution.",
      );
      setDraft(undefined);
    } else if (result.status === "execution_failed")
      setError(
        "Included, but execution reverted. Gas and nonce were consumed.",
      );
    else
      setNotice(
        "Submitted; awaiting a confirmed execution event. Use Reconcile to check again.",
      );
    return result;
  }
  async function ownerAction(data: Hex) {
    if (!account) throw new Error("Create an account first");
    if (snapshot?.threshold !== "1")
      throw new Error(
        "This policy needs threshold approvals; prepare it in the operation composer.",
      );
    const d = await prepare([{ target: account, value: 0n, data }]);
    if (d) {
      const receipt = await submit(await approve(d, "owner"));
      if (receipt.status !== "succeeded")
        throw new Error(
          "Policy update is not confirmed. Reconcile the operation before treating local credentials as active.",
        );
    }
  }
  async function compose() {
    if (rawActions.trim()) {
      const input = JSON.parse(rawActions) as {
        target: Address;
        value: string;
        data: Hex;
      }[];
      if (!Array.isArray(input) || input.length < 1 || input.length > 16)
        throw new Error("Use an array of 1–16 calls");
      await prepare(
        input.map((a) => ({
          target: a.target,
          value: BigInt(a.value),
          data: a.data,
        })),
      );
      setTab("Operations");
      return;
    }
    if (!config || !/^\d{1,18}$/.test(amount))
      throw new Error("Enter a non-negative integer");
    const actions: Action[] = [
      {
        target: config.counter,
        value: 0n,
        data: encodeFunctionData({
          abi: counterAbi,
          functionName: "increment",
          args: [BigInt(amount)],
        }),
      },
    ];
    if (batch)
      actions.push({
        target: config.counter,
        value: 0n,
        data: encodeFunctionData({
          abi: counterAbi,
          functionName: fail ? "fail" : "increment",
          args: fail ? undefined : [BigInt(amount)],
        } as never),
      });
    await prepare(actions);
    setTab("Operations");
    setNotice(
      "Review the targets and limits, then collect the required signatures.",
    );
  }
  async function enableSession() {
    if (!keys || !config) throw new Error("Wallet unavailable");
    const key = generatePrivateKey();
    persist({ ...keys, session: key });
    await ownerAction(
      encodeFunctionData({
        abi: accountAbi,
        functionName: "setSession",
        args: [
          privateKeyToAccount(key).address,
          config.counter,
          "0x7cf5dab0",
          Math.floor(Date.now() / 1000) + 3600,
          parseEther("0.001"),
        ],
      }),
    );
  }
  async function enableMultisig() {
    if (!keys || !snapshot || !account) throw new Error("Wallet unavailable");
    const key = generatePrivateKey();
    const co = privateKeyToAccount(key).address;
    const owners = [snapshot.owners[0], co].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    persist({ ...keys, cosigner: key });
    await ownerAction(
      encodeFunctionData({
        abi: accountAbi,
        functionName: "setOwners",
        args: [owners, 2n],
      }),
    );
  }
  async function enrollPasskey() {
    if (!keys) throw new Error("Wallet unavailable");
    const passkey = await registerPasskey();
    await ownerAction(
      encodeFunctionData({
        abi: accountAbi,
        functionName: "setPasskey",
        args: [passkey.x, passkey.y, passkey.rp, passkey.origin],
      }),
    );
    persist({ ...keys, credentialId: passkey.id });
  }
  async function proposeRecovery() {
    if (!keys || !account || !/^0x[0-9a-fA-F]{40}$/.test(replacement))
      throw new Error("Enter the replacement owner address");
    const wallet = createWalletClient({
      account: privateKeyToAccount(keys.guardian),
      chain: webChain,
      transport: http("/api/rpc"),
    });
    const hash = await wallet.writeContract({
      address: account,
      abi: accountAbi,
      functionName: "proposeRecovery",
      args: [replacement as Address],
    });
    setNotice(
      `Guardian proposal submitted: ${hash}. Recovery requires two days before completion.`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await refresh();
  }
  const online = Boolean(config);
  const ownerAddress = snapshot?.owners[0];
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/" aria-label="W05 home">
          <span className="brand-icon">◈</span> W05
          <span className="brand-sub">ACCOUNT SYSTEMS</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            Smart account lab<small>Local workspace</small>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {["Overview", "Operations", "Access & recovery", "Security"].map(
            (name, i) => (
              <button
                key={name}
                aria-label={name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                <span>{["▦", "↗", "⌘", "◇"][i]}</span>
                {name}
                {name === "Operations" && receipts.length > 0 && (
                  <b>{receipts.length}</b>
                )}
              </button>
            ),
          )}
        </nav>
        <div className="aside-bottom">
          <div className="network-dot" />
          <div>
            {webChain.id === 31337
              ? "Isolated local network"
              : "Ethereum Sepolia testnet"}
            <small>Chain {webChain.id} · EntryPoint 0.8</small>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{tab}</strong>
          </div>
          <div className="header-right">
            <span className={"connection " + (online ? "ok" : "")}>
              {online ? "● Connected" : "○ Unavailable"}
            </span>
            <button
              className="secondary"
              disabled={busy || !connection.connectors.length}
              onClick={() =>
                void run(async () => {
                  await connection.connectAsync({
                    connector: connection.connectors[0],
                  });
                  setNotice(
                    `Injected wallet connected. Switch to the account owner and chain ${webChain.id} before approving.`,
                  );
                })
              }
            >
              {injectedAccount.address
                ? short(injectedAccount.address)
                : "Connect wallet"}
            </button>
            <span className="avatar">SA</span>
          </div>
        </header>
        <div className="content">
          <div className="title-row">
            <div>
              <div className="eyebrow">PROGRAMMABLE BY DESIGN</div>
              <h1>{tab === "Overview" ? "Your account. Your rules." : tab}</h1>
              <p>
                {tab === "Overview"
                  ? "A clear view of your smart account, permissions, and sponsored activity."
                  : "Configure, inspect and verify every authorization on your account."}
              </p>
            </div>
            <button
              className="primary"
              disabled={busy || !online}
              onClick={() => void run(account ? compose : create)}
            >
              {busy
                ? "Working…"
                : account
                  ? "＋ New operation"
                  : "＋ Create smart account"}
            </button>
          </div>
          <div className="scope-banner">
            <span>◉</span>
            <div>
              <strong>Local development workspace</strong>
              <span>
                Disposable signers and simulated ETH. No mainnet assets. Browser
                keys stay in this tab’s session storage.
              </span>
            </div>
            <span className="pill">SANDBOX</span>
          </div>
          {error && (
            <div role="alert" className="message error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="message success">
              {notice}
            </div>
          )}
          {tab === "Overview" && (
            <>
              <div className="stats">
                <article>
                  <div>
                    ACCOUNT BALANCE <span>↗</span>
                  </div>
                  <h2>
                    {eth(snapshot?.balance)} <small>ETH</small>
                  </h2>
                  <footer>Available for account calls</footer>
                </article>
                <article>
                  <div>
                    SPONSORSHIP BUDGET <span>◈</span>
                  </div>
                  <h2>
                    {eth(snapshot?.quota)} <small>ETH</small>
                  </h2>
                  <footer>Worst-case gas reservation</footer>
                </article>
                <article>
                  <div>
                    AUTHORIZATION POLICY <span>⌘</span>
                  </div>
                  <h2>
                    {snapshot?.threshold ?? "—"}{" "}
                    <small>
                      approval{snapshot?.threshold === "1" ? "" : "s"} required
                    </small>
                  </h2>
                  <footer>Policy epoch {snapshot?.epoch ?? "—"}</footer>
                </article>
              </div>
              <div className="two-col">
                <section className="panel account-panel">
                  <div className="panel-title">
                    <h3>Smart account</h3>
                    <span className="pill green">
                      {account ? "DEPLOYED" : "NOT CREATED"}
                    </span>
                  </div>
                  <div className="account-art">
                    <div className="orb">◈</div>
                    <div>
                      <small>ACCOUNT ADDRESS</small>
                      <h3>{short(account)}</h3>
                      <button
                        className="text-button"
                        disabled={!account}
                        onClick={() =>
                          account && void navigator.clipboard.writeText(account)
                        }
                      >
                        Copy full address ↗
                      </button>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Owner</dt>
                      <dd title={ownerAddress}>{short(ownerAddress)}</dd>
                    </div>
                    <div>
                      <dt>EntryPoint</dt>
                      <dd title={config?.entryPoint}>
                        {short(config?.entryPoint)}
                      </dd>
                    </div>
                    <div>
                      <dt>Execution model</dt>
                      <dd>ERC-4337 · atomic batches</dd>
                    </div>
                    <div>
                      <dt>Upgradeability</dt>
                      <dd>Immutable account</dd>
                    </div>
                  </dl>
                  <button
                    className="secondary full"
                    disabled={busy || !account}
                    onClick={() => setTab("Access & recovery")}
                  >
                    Manage account access <span>↗</span>
                  </button>
                </section>
                <section className="panel">
                  <div className="panel-title">
                    <h3>Make an operation</h3>
                    <span className="muted">01 — 03</span>
                  </div>
                  <p className="panel-copy">
                    Prepare a call, inspect the payload, then approve and submit
                    it.
                  </p>
                  <label>
                    Increment amount
                    <input
                      aria-label="Increment amount"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={batch}
                      onChange={(e) => setBatch(e.target.checked)}
                    />
                    Add a second call to the atomic batch
                  </label>
                  {batch && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={fail}
                        onChange={(e) => setFail(e.target.checked)}
                      />
                      Make the second call revert
                    </label>
                  )}
                  <details>
                    <summary>Advanced: custom atomic calls</summary>
                    <label>
                      JSON array: target, value in wei, data
                      <textarea
                        aria-label="Custom calls JSON"
                        placeholder={
                          '[{"target":"0x…","value":"0","data":"0x…"}]'
                        }
                        value={rawActions}
                        onChange={(e) => setRawActions(e.target.value)}
                      />
                    </label>
                  </details>
                  <div className="target-preview">
                    <span>Reviewed target</span>
                    <strong>Counter · {short(config?.counter)}</strong>
                    <span>Current on-chain value</span>
                    <strong data-testid="counter-value">
                      {snapshot?.number ?? "0"}
                    </strong>
                  </div>
                  <button
                    className="primary full"
                    disabled={busy || !account}
                    onClick={() => void run(compose)}
                  >
                    Prepare operation <span>→</span>
                  </button>
                </section>
              </div>
            </>
          )}
          {tab === "Operations" && (
            <>
              <section className="panel">
                <div className="panel-title">
                  <h3>Operation review</h3>
                  <span className="pill">SIGNED PAYLOAD</span>
                </div>
                {draft ? (
                  <>
                    <div className="review-grid">
                      <div>
                        <small>OPERATION HASH</small>
                        <code>{draft.hash}</code>
                      </div>
                      <div>
                        <small>NONCE</small>
                        <strong>{draft.op.nonce.toString()}</strong>
                      </div>
                      <div>
                        <small>APPROVALS COLLECTED</small>
                        <strong>
                          {Object.keys(draft.approvals).length} /{" "}
                          {snapshot?.threshold ?? "1"}
                        </strong>
                      </div>
                    </div>
                    <details>
                      <summary>Inspect complete operation payload</summary>
                      <pre>{json(draft.op)}</pre>
                    </details>
                    <div className="actions">
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() =>
                          void run(async () => {
                            await approve(draft, "owner");
                          })
                        }
                      >
                        Approve as owner
                      </button>
                      {keys?.cosigner && (
                        <button
                          disabled={busy}
                          className="secondary"
                          onClick={() =>
                            void run(async () => {
                              await approve(draft, "cosigner");
                            })
                          }
                        >
                          Approve as cosigner
                        </button>
                      )}
                      {keys?.session && (
                        <button
                          disabled={busy}
                          className="secondary"
                          onClick={() =>
                            void run(async () => {
                              await approve(draft, "session");
                            })
                          }
                        >
                          Use session key
                        </button>
                      )}
                      {keys?.credentialId && (
                        <button
                          disabled={busy}
                          className="secondary"
                          onClick={() =>
                            void run(async () => {
                              await approve(draft, "passkey");
                            })
                          }
                        >
                          Approve with passkey
                        </button>
                      )}
                      <button
                        disabled={busy || draft.op.signature === "0x"}
                        className="secondary"
                        onClick={() =>
                          void run(async () => {
                            const result = await api<{
                              validation: string;
                              execution: string;
                            }>("simulate", draft.op);
                            setNotice(
                              `Validation ${result.validation}. ${result.execution}`,
                            );
                          })
                        }
                      >
                        Simulate
                      </button>
                      <button
                        disabled={busy || draft.op.signature === "0x"}
                        className="primary"
                        onClick={() => void run(() => submit(draft))}
                      >
                        Submit operation
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty">
                    <span>↗</span>
                    <h3>No operation prepared</h3>
                    <p>Start from the overview to create a signed operation.</p>
                    <button
                      className="secondary"
                      onClick={() => setTab("Overview")}
                    >
                      Go to overview
                    </button>
                  </div>
                )}
              </section>
              <section className="panel activity">
                <div className="panel-title">
                  <h3>Activity</h3>
                  <button
                    className="text-button"
                    disabled={busy || !account}
                    onClick={() => void run(() => refresh())}
                  >
                    Refresh ↻
                  </button>
                </div>
                {receipts.length ? (
                  receipts.map((receipt) => (
                    <div className="activity-row" key={receipt.hash}>
                      <span
                        className={
                          "status-symbol " +
                          (receipt.status === "succeeded" ? "good" : "")
                        }
                      >
                        {receipt.status === "succeeded" ? "✓" : "↗"}
                      </span>
                      <div>
                        <strong>{receipt.status.replaceAll("_", " ")}</strong>
                        <small title={receipt.hash}>
                          {short(receipt.hash)}
                        </small>
                      </div>
                      <div>
                        <small>TRANSACTION</small>
                        <code title={receipt.transactionHash}>
                          {short(receipt.transactionHash)}
                        </code>
                      </div>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const next = await api<Receipt>(
                              `operation?hash=${receipt.hash}`,
                            );
                            setReceipts((items) =>
                              items.map((item) =>
                                item.hash === next.hash ? next : item,
                              ),
                            );
                            await refresh();
                          })
                        }
                      >
                        Reconcile ↻
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty compact">
                    Your confirmed operations will appear here.
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "Access & recovery" && (
            <div className="access-grid">
              <section className="panel">
                <div className="panel-title">
                  <h3>Passkey authorization</h3>
                  <span>◎</span>
                </div>
                <p className="panel-copy">
                  Authorize operations using a P256 passkey with user
                  verification, an exact origin, and RP ID binding. Available
                  for single-approval policy.
                </p>
                <button
                  className="primary"
                  disabled={busy || !account || snapshot?.threshold !== "1"}
                  onClick={() => void run(enrollPasskey)}
                >
                  Register passkey
                </button>
                <button
                  className="text-button"
                  disabled={busy || !account}
                  onClick={() =>
                    void run(() =>
                      ownerAction(
                        encodeFunctionData({
                          abi: accountAbi,
                          functionName: "revokePasskey",
                        }),
                      ),
                    )
                  }
                >
                  Revoke passkey
                </button>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h3>Scoped session key</h3>
                  <span>⌘</span>
                </div>
                <p className="panel-copy">
                  Limit a session to Counter.increment, 0.001 ETH total value,
                  and one hour. Policy changes invalidate existing sessions.
                </p>
                <code>
                  {keys?.session
                    ? short(privateKeyToAccount(keys.session).address)
                    : "No local session key"}
                </code>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy || !account}
                    onClick={() => void run(enableSession)}
                  >
                    Create session key
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || !keys?.session}
                    onClick={() =>
                      void run(() =>
                        ownerAction(
                          encodeFunctionData({
                            abi: accountAbi,
                            functionName: "revokeSession",
                            args: [privateKeyToAccount(keys!.session!).address],
                          }),
                        ),
                      )
                    }
                  >
                    Revoke session
                  </button>
                </div>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h3>Threshold approvals</h3>
                  <span>◈</span>
                </div>
                <p className="panel-copy">
                  Switch this local account to 2-of-2 ownership. Each operation
                  then needs two separate approval actions. Both test signers
                  are kept in this tab; this does not simulate independent human
                  custody.
                </p>
                <button
                  className="secondary"
                  disabled={busy || !account || snapshot?.threshold !== "1"}
                  onClick={() => void run(enableMultisig)}
                >
                  Enable 2-of-2 policy
                </button>
                <p className="muted">
                  Current threshold: {snapshot?.threshold ?? "—"}
                </p>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h3>Guardian recovery</h3>
                  <span>◇</span>
                </div>
                <p className="panel-copy">
                  A guardian proposes a new owner. A two-day on-chain delay
                  gives the current owner time to cancel.
                </p>
                <label>
                  Replacement owner
                  <input
                    aria-label="Replacement owner"
                    placeholder="0x…"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy || !account}
                    onClick={() => void run(proposeRecovery)}
                  >
                    Propose as guardian
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || !account}
                    onClick={() =>
                      void run(() =>
                        ownerAction(
                          encodeFunctionData({
                            abi: accountAbi,
                            functionName: "cancelRecovery",
                          }),
                        ),
                      )
                    }
                  >
                    Cancel recovery
                  </button>
                </div>
                <button
                  className="secondary"
                  disabled={busy || !account || !snapshot?.recoveryReadyAt}
                  onClick={() =>
                    void run(async () => {
                      if (!keys || !account)
                        throw new Error("Wallet unavailable");
                      const wallet = createWalletClient({
                        account: privateKeyToAccount(keys.guardian),
                        chain: webChain,
                        transport: http("/api/rpc"),
                      });
                      const hash = await wallet.writeContract({
                        address: account,
                        abi: accountAbi,
                        functionName: "completeRecovery",
                        args: [],
                      });
                      setNotice(`Recovery transaction submitted: ${hash}`);
                      await new Promise((resolve) => setTimeout(resolve, 500));
                      await refresh();
                    })
                  }
                >
                  Complete recovery after delay
                </button>
                <p className="muted">
                  Votes: {snapshot?.recoveryVotes ?? "0"} · Ready:{" "}
                  {snapshot?.recoveryReadyAt
                    ? new Date(snapshot.recoveryReadyAt * 1000).toLocaleString()
                    : "No proposal"}
                </p>
              </section>
            </div>
          )}
          {tab === "Security" && (
            <section className="panel security">
              <div className="panel-title">
                <h3>Trust and verification</h3>
                <span className="pill">SELF-ASSESSMENT</span>
              </div>
              <p>
                Every operation is bound to the chain, EntryPoint, full nonce
                and account policy epoch. Session authorization is checked again
                during execution.
              </p>
              <dl>
                <div>
                  <dt>Account code</dt>
                  <dd>Non-upgradeable · no delegatecall</dd>
                </div>
                <div>
                  <dt>Session scope</dt>
                  <dd>Exact target and selector · cumulative native value</dd>
                </div>
                <div>
                  <dt>Sponsor protection</dt>
                  <dd>
                    Signed payload · expiry · worst-case quota reservation
                  </dd>
                </div>
                <div>
                  <dt>Batch failure</dt>
                  <dd>
                    Target state rolls back; gas and nonce can still be consumed
                  </dd>
                </div>
                <div>
                  <dt>Bundler scope</dt>
                  <dd>
                    Local allowlisted service; public mempool compatibility
                    unverified
                  </dd>
                </div>
                <div>
                  <dt>Audit status</dt>
                  <dd>
                    AI-assisted self-assessment; no independent audit
                    certification
                  </dd>
                </div>
              </dl>
              <p className="muted">
                Do not use these local keys or this workspace to hold real
                assets. Native ETH session limits do not constrain token
                allowances or an allowed target’s internal behavior.
              </p>
            </section>
          )}
          <footer className="page-footer">
            <span>W05 / Smart Account Platform</span>
            <span>
              Chain state is the source of truth{" "}
              <span className="network-dot" />
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
export default function Page() {
  return (
    <Providers>
      <App />
    </Providers>
  );
}
