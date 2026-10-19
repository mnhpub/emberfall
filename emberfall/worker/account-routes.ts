// HTTP for accounts: register, sign in, and check who a session belongs to. Sessions are HMAC tokens scoped to the
// "account" room, so they cannot be used on the game's authority or room routes.
import { register, signIn } from "./accounts.ts";
import { d1AccountStore } from "./account-store.ts";
import { issueSession, verifySession } from "./session.ts";

export const ACCOUNT_ROOM = "account";
export const SESSION_SECONDS = 900;
const MAX_BODY = 4096;

export type AccountEnv = { DB: D1Database; AUTHORITY_SIGNING_KEY?: string };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function accountRoute(request: Request, env: AccountEnv): Promise<Response> {
  const url = new URL(request.url);
  if (!env.DB) return json({ error: "Accounts are not configured." }, 503);
  if (!env.AUTHORITY_SIGNING_KEY || new TextEncoder().encode(env.AUTHORITY_SIGNING_KEY).length < 32)
    return json({ error: "Accounts are not configured." }, 503);
  const store = d1AccountStore(env.DB);
  const secret = env.AUTHORITY_SIGNING_KEY;

  if (url.pathname === "/api/account/register" && request.method === "POST") {
    const body = await readJson(request);
    if (!body) return json({ error: "Send a JSON object of at most 4 KiB." }, 400);
    const result = await register(
      store,
      {
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
        displayName: String(body.displayName ?? ""),
      },
      Date.now(),
      () => crypto.randomUUID(),
    );
    if (!result.ok) return json({ error: result.error }, 400);
    const token = await issueSession(secret, result.account.id, ACCOUNT_ROOM, undefined, SESSION_SECONDS);
    return json({ account: result.account, token, expiresIn: SESSION_SECONDS }, 201);
  }

  if (url.pathname === "/api/account/signin" && request.method === "POST") {
    const body = await readJson(request);
    if (!body) return json({ error: "Send a JSON object of at most 4 KiB." }, 400);
    const result = await signIn(store, { email: String(body.email ?? ""), password: String(body.password ?? "") }, Date.now());
    if (!result.ok) return json({ error: result.error }, result.error.startsWith("Too many") ? 429 : 401);
    const token = await issueSession(secret, result.accountId, ACCOUNT_ROOM, undefined, SESSION_SECONDS);
    return json({ accountId: result.accountId, token, expiresIn: SESSION_SECONDS });
  }

  if (url.pathname === "/api/account/me" && request.method === "GET") {
    const bearer = request.headers.get("authorization") ?? "";
    try {
      const claims = await verifySession(bearer.startsWith("Bearer ") ? bearer.slice(7) : "", secret, ACCOUNT_ROOM);
      return json({ accountId: claims.sub, expiresAt: claims.exp });
    } catch {
      return json({ error: "Sign in again." }, 401);
    }
  }

  return json({ error: "Not found" }, 404);
}
