import { encodeAbiParameters, toHex, hexToBytes, type Hex } from "viem";
const P256_N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
export function decodeDerSignature(input: Uint8Array): { r: Hex; s: Hex } {
  let offset = 0;
  if (input[offset++] !== 0x30) throw new Error("Invalid DER sequence");
  const length = input[offset++];
  if (length !== input.length - 2 || length >= 128)
    throw new Error("Invalid DER length");
  function integer(): bigint {
    if (input[offset++] !== 2) throw new Error("Invalid DER integer");
    const size = input[offset++];
    if (size < 1 || size > 33 || offset + size > input.length)
      throw new Error("Invalid DER integer length");
    const value = input.slice(offset, offset + size);
    offset += size;
    if (value[0] & 128) throw new Error("Negative DER integer");
    if (size > 1 && value[0] === 0 && !(value[1] & 128))
      throw new Error("Non-canonical DER integer");
    return BigInt(toHex(value));
  }
  const r = integer(),
    s = integer();
  if (
    offset !== input.length ||
    r <= 0n ||
    r >= P256_N ||
    s <= 0n ||
    s >= P256_N
  )
    throw new Error("Invalid P256 scalar");
  return {
    r: toHex(r, { size: 32 }),
    s: toHex(s > P256_N / 2n ? P256_N - s : s, { size: 32 }),
  };
}
const buffer = (bytes: Uint8Array): ArrayBuffer =>
  Uint8Array.from(bytes).buffer;
export const b64url = (input: Uint8Array) =>
  btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const fromB64 = (input: string) =>
  Uint8Array.from(atob(input.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export async function registerPasskey(): Promise<{
  id: string;
  x: Hex;
  y: Hex;
  rp: Hex;
  origin: string;
}> {
  const rpId = window.location.hostname;
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "W05 Smart Account", id: rpId },
      user: {
        id: crypto.getRandomValues(new Uint8Array(32)),
        name: "W05 local owner",
        displayName: "W05 account owner",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "preferred",
      },
      attestation: "none",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration cancelled");
  const response = credential.response as AuthenticatorAttestationResponse;
  const spki = response.getPublicKey();
  if (!spki) throw new Error("Browser cannot export P256 public key");
  const key = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (!jwk.x || !jwk.y) throw new Error("Missing P256 key coordinates");
  return {
    id: b64url(new Uint8Array(credential.rawId)),
    x: toHex(fromB64(jwk.x)),
    y: toHex(fromB64(jwk.y)),
    rp: toHex(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)),
      ),
    ),
    origin: window.location.origin,
  };
}
export async function signWithPasskey(id: string, hash: Hex): Promise<Hex> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: buffer(hexToBytes(hash)),
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: buffer(fromB64(id)) }],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey authentication cancelled");
  const response = credential.response as AuthenticatorAssertionResponse;
  const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
  const challengeIndex = clientDataJSON.indexOf('"challenge":');
  const typeIndex = clientDataJSON.indexOf('"type":');
  if (challengeIndex < 0 || typeIndex < 0)
    throw new Error("Unexpected client data");
  const { r, s } = decodeDerSignature(new Uint8Array(response.signature));
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
          { name: "challengeIndex", type: "uint256" },
          { name: "typeIndex", type: "uint256" },
          { name: "authenticatorData", type: "bytes" },
          { name: "clientDataJSON", type: "string" },
        ],
      },
    ],
    [
      {
        r,
        s,
        challengeIndex: BigInt(challengeIndex),
        typeIndex: BigInt(typeIndex),
        authenticatorData: toHex(new Uint8Array(response.authenticatorData)),
        clientDataJSON,
      },
    ],
  );
}
