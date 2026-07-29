import type { User } from "../types";
import { sha224 } from "../crypto";

export const WS_READY_STATE_OPEN = 1;

const CACHE_TTL = 300_000;
const POSITIVE_CACHE_MAX = 256;
const NEGATIVE_CACHE_MAX = 512;
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

const userCache = new Map<string, { user: User; expires: number }>();
const missingUserCache = new Map<string, number>();

function getCachedUser(key: string): User | null | undefined {
  const cached = userCache.get(key);
  if (cached) {
    if (cached.expires <= Date.now()) {
      userCache.delete(key);
    } else {
      userCache.delete(key);
      userCache.set(key, cached);
      return cached.user;
    }
  }

  const missingExpires = missingUserCache.get(key);
  if (missingExpires === undefined) return undefined;
  if (missingExpires <= Date.now()) {
    missingUserCache.delete(key);
    return undefined;
  }
  missingUserCache.delete(key);
  missingUserCache.set(key, missingExpires);
  return null;
}

function cacheUser(key: string, user: User | null): void {
  const now = Date.now();
  pruneExpiredCache(now);

  if (user) {
    missingUserCache.delete(key);
    setBounded(userCache, key, { user, expires: now + CACHE_TTL }, POSITIVE_CACHE_MAX);
  } else {
    userCache.delete(key);
    setBounded(missingUserCache, key, now + CACHE_TTL, NEGATIVE_CACHE_MAX);
  }
}

function pruneExpiredCache(now: number): void {
  for (const [key, cached] of userCache) {
    if (cached.expires <= now) userCache.delete(key);
  }
  for (const [key, expires] of missingUserCache) {
    if (expires <= now) missingUserCache.delete(key);
  }
}

function setBounded<T>(cache: Map<string, T>, key: string, value: T, maxSize: number): void {
  cache.delete(key);
  while (cache.size >= maxSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  cache.set(key, value);
}

export function clearUserCache(): void {
  userCache.clear();
  missingUserCache.clear();
}

export function safeCloseWebSocket(socket: WebSocket): void {
  try {
    if (socket.readyState === 1 || socket.readyState === 2) {
      socket.close();
    }
  } catch { }
}

export function base64ToArrayBuffer(base64Str: string): { earlyData: ArrayBuffer | null; error: Error | null } {
  if (!base64Str) return { earlyData: null, error: null };
  try {
    base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    const decode = atob(base64Str);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    return { earlyData: null, error: error as Error };
  }
}

export function makeReadableWebSocketStream(
  webSocketServer: WebSocket,
  earlyDataHeader: string,
  log: (info: string) => void,
): ReadableStream {
  let readableStreamCancel = false;
  return new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event: MessageEvent) => {
        if (readableStreamCancel) return;
        controller.enqueue(event.data);
      });
      webSocketServer.addEventListener("close", () => {
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) return;
        controller.close();
      });
      webSocketServer.addEventListener("error", () => {
        log("webSocketServer error");
        controller.error(new Error("webSocketServer error"));
      });
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },
    pull() { },
    cancel() {
      if (readableStreamCancel) return;
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    },
  });
}

export function remoteSocketToWS(
  remoteSocket: Socket,
  webSocket: WebSocket,
  vlessResponseHeader: Uint8Array | null,
  retry: (() => void) | null,
  log: (info: string) => void,
): Promise<void> {
  let vlessHeader = vlessResponseHeader;
  let hasIncomingData = false;
  const stream = new WritableStream({
    async write(chunk: ArrayBuffer) {
      hasIncomingData = true;
      if (webSocket.readyState !== 1) {
        throw new Error("webSocket connection is not open");
      }
      if (vlessHeader) {
        webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
        vlessHeader = null;
      } else {
        webSocket.send(chunk);
      }
    },
    close() {
      log("remoteSocket.readable closed, hasIncomingData: " + hasIncomingData);
    },
    abort(reason: unknown) {
      console.error("remoteSocket.readable abort", reason);
    },
  });
  return remoteSocket.readable.pipeTo(stream).catch((error) => {
    console.error("remoteSocketToWS error:", error);
    safeCloseWebSocket(webSocket);
  }).then(() => {
    if (!hasIncomingData && retry) {
      log("retry");
      retry();
    }
  });
}

export async function lookupUserByUUID(env: Env, uuid: string): Promise<User | null> {
  const normalizedUUID = uuid.toLowerCase();
  if (!UUID_PATTERN.test(normalizedUUID)) return null;

  const cacheKey = `uuid:${normalizedUUID}`;
  const cached = getCachedUser(cacheKey);
  if (cached !== undefined) return cached;

  const user = await env.DB.prepare("SELECT * FROM users WHERE uuid = ? AND enabled = 1")
    .bind(normalizedUUID)
    .first<User>();
  cacheUser(cacheKey, user || null);
  return user;
}

export async function lookupTrojanUser(env: Env, passwordHash: string): Promise<User | null> {
  const normalizedHash = passwordHash.toLowerCase();
  if (!/^[0-9a-f]{56}$/.test(normalizedHash)) return null;

  const cacheKey = `trojan:${normalizedHash}`;
  const cached = getCachedUser(cacheKey);
  if (cached !== undefined) return cached;

  const users = await env.DB.prepare("SELECT * FROM users WHERE enabled = 1").all<User>();
  for (const user of users.results) {
    if (await sha224(user.uuid) === normalizedHash) {
      cacheUser(cacheKey, user);
      cacheUser(`uuid:${user.uuid.toLowerCase()}`, user);
      return user;
    }
  }

  cacheUser(cacheKey, null);
  return null;
}
