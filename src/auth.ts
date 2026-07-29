import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { now, randomToken, sha256 } from "./crypto";

type AppContext = Context<{ Bindings: Env }>;

export const SESSION_COOKIE = "__Host-admin_session";
const SESSION_TTL = 4 * 60 * 60;

export async function createAdminSession(context: AppContext): Promise<void> {
  const token = randomToken();
  const timestamp = now();
  await context.env.DB.prepare(
    `INSERT INTO admin_sessions (token_hash, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(await sha256(token), timestamp, timestamp, timestamp + SESSION_TTL)
    .run();
  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function currentAdmin(context: AppContext): Promise<boolean> {
  const token = getCookie(context, SESSION_COOKIE);
  if (!token) return false;
  const tokenHash = await sha256(token);
  const timestamp = now();
  const session = await context.env.DB.prepare(
    `SELECT token_hash FROM admin_sessions
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
  )
    .bind(tokenHash, timestamp)
    .first<{ token_hash: string }>();
  if (!session) {
    deleteCookie(context, SESSION_COOKIE, { path: "/", secure: true });
    return false;
  }
  context.executionCtx.waitUntil(
    context.env.DB.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(timestamp, tokenHash)
      .run(),
  );
  return true;
}

export async function revokeAdminSession(context: AppContext): Promise<void> {
  const token = getCookie(context, SESSION_COOKIE);
  if (token) {
    await context.env.DB.prepare(
      "UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    )
      .bind(now(), await sha256(token))
      .run();
  }
  deleteCookie(context, SESSION_COOKIE, { path: "/", secure: true });
}

export async function requireAdmin(context: AppContext): Promise<boolean> {
  const authed = await currentAdmin(context);
  if (!authed) return false;
  return true;
}
