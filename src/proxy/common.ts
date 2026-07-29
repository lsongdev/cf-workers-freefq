import type { User } from "../types";
import { sha224 } from "../crypto";

export const WS_READY_STATE_OPEN = 1;

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
  return env.DB.prepare("SELECT * FROM users WHERE uuid = ? AND enabled = 1")
    .bind(uuid)
    .first<User>();
}

export async function lookupTrojanUser(env: Env, passwordHash: string): Promise<User | null> {
  if (!/^[0-9a-f]{56}$/i.test(passwordHash)) return null;

  const users = await env.DB.prepare("SELECT * FROM users WHERE enabled = 1").all<User>();
  for (const user of users.results) {
    if (await sha224(user.uuid) === passwordHash.toLowerCase()) {
      return user;
    }
  }
  return null;
}
