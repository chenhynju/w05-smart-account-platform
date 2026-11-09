import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const decrypt = [
  "import sys",
  "from pathlib import Path",
  "from eth_account import Account",
  "key = Account.decrypt(Path(sys.argv[1]).read_text(), Path(sys.argv[2]).read_bytes().rstrip(b'\\r\\n'))",
  "sys.stdout.write('0x' + key.hex())",
].join("\n");

export function sepoliaDeployer(fallback: Hex) {
  if (existsSync(".env.deployment.local")) loadEnvFile(".env.deployment.local");
  const {
    DEPLOYER_ADDRESS: expected,
    DEPLOYER_KEYSTORE: keystore,
    DEPLOYER_PASSWORD_FILE: passwordFile,
    DEPLOYER_KEYSTORE_PYTHON: python,
  } = process.env;
  if (!expected && !keystore && !passwordFile && !python)
    return privateKeyToAccount(fallback);
  if (
    !expected ||
    !isAddress(expected) ||
    !keystore ||
    !passwordFile ||
    !python
  )
    throw new Error("Incomplete Sepolia deployer configuration");
  if (
    [keystore, passwordFile].some((path) => (statSync(path).mode & 0o077) !== 0)
  )
    throw new Error("Sepolia signer files must be private");
  let key: string;
  try {
    key = execFileSync(python, ["-c", decrypt, keystore, passwordFile], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
    }).trim();
  } catch {
    throw new Error("Could not unlock the configured Sepolia deployer");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error("Invalid keystore signer output");
  const account = privateKeyToAccount(key as Hex);
  if (account.address.toLowerCase() !== expected.toLowerCase())
    throw new Error("Configured Sepolia deployer does not match the keystore");
  return account;
}
