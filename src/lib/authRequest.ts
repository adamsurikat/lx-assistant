import { AuthInputError } from "./localAuth";

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host) || !["http", "https"].includes(protocol)) throw new AuthInputError("Invalid request origin.");
  return new URL(`${protocol}://${host}`).origin;
}

export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== requestOrigin(request)) throw new AuthInputError("Invalid request origin.", 403);
}

export async function readAuthJson(request: Request) {
  requireSameOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new AuthInputError("Expected JSON.", 415);
  const text = await request.text();
  if (text.length > 4096) throw new AuthInputError("Request is too large.", 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AuthInputError("Invalid JSON."); }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthInputError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Account operation failed");
  return Response.json({ error: "Could not complete this request. Please try again." }, { status: 500 });
}
