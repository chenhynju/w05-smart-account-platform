import {
  applicationOrigins,
  serviceEndpoint,
  proxyToken,
} from "../../../../../packages/http-policy";
import { NextRequest } from "next/server";
const allowed = new Set([
  "config",
  "bundler",
  "health",
  "challenge",
  "accounts",
  "account",
  "prepare",
  "simulate",
  "submit",
  "operation",
  "rpc",
]);
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.length !== 1 || !allowed.has(path[0]))
    return Response.json({ error: "Not found" }, { status: 404 });
  let upstream: URL;
  let origins: string[];
  let token: string | undefined;
  try {
    upstream = serviceEndpoint();
    origins = applicationOrigins();
    token = proxyToken();
  } catch {
    return Response.json(
      { error: "Service hosting is not configured" },
      { status: 503 },
    );
  }
  const origin = request.headers.get("origin");
  if (request.method === "POST" && !origins.includes(origin ?? ""))
    return Response.json({ error: "Untrusted origin" }, { status: 403 });
  try {
    let payload: string | undefined;
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 131072) {
            await reader.cancel();
            return Response.json({ error: "Body too large" }, { status: 413 });
          }
          parts.push(value);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      payload = new TextDecoder().decode(bytes);
    }
    const response = await fetch(
      new URL(`/${path[0]}${request.nextUrl.search}`, upstream),
      {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { origin } : {}),
          ...(token ? { "x-w05-proxy-token": token } : {}),
        },
        body: payload,
        signal: AbortSignal.timeout(30000),
        cache: "no-store",
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "Account service unavailable; check service and chain" },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
