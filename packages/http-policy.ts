/** Deployment-owned HTTP boundaries. Never derive trusted origins from request headers. */
export function applicationOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const value = env.W05_APP_ORIGIN;
  if (!value) {
    if (
      env.W05_NETWORK === "sepolia" ||
      env.NEXT_PUBLIC_W05_NETWORK === "sepolia"
    )
      throw new Error("W05_APP_ORIGIN is required for public hosting");
    return ["http://localhost:3155", "http://127.0.0.1:3155"];
  }
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.username ||
    url.password ||
    url.hostname.includes("*")
  )
    throw new Error("W05_APP_ORIGIN must be an exact HTTPS origin");
  return [url.origin];
}

export function serviceEndpoint(
  env: Record<string, string | undefined> = process.env,
): URL {
  const value = env.W05_SERVICE_URL;
  if (!value) {
    if (
      env.W05_NETWORK === "sepolia" ||
      env.NEXT_PUBLIC_W05_NETWORK === "sepolia"
    )
      throw new Error("W05_SERVICE_URL is required for public hosting");
    return new URL("http://127.0.0.1:4355");
  }
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.username ||
    url.password ||
    url.hostname.includes("*")
  )
    throw new Error("W05_SERVICE_URL must be an exact HTTPS origin");
  return url;
}

export function proxyToken(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const token = env.W05_PROXY_TOKEN;
  if (
    env.W05_NETWORK === "sepolia" ||
    env.NEXT_PUBLIC_W05_NETWORK === "sepolia"
  ) {
    if (!token || token.length < 32)
      throw new Error(
        "Public hosting requires W05_PROXY_TOKEN (at least 32 characters)",
      );
  }
  return token;
}
