import { connect } from "cloudflare:sockets";
import {
  makeReadableWebSocketStream,
  remoteSocketToWS,
  safeCloseWebSocket,
  lookupTrojanUser,
} from "./common";

export async function trojanOverWSHandler(request: Request, env: Env): Promise<Response> {
  const webSocketPair = new WebSocketPair();
  const pair = Object.values(webSocketPair) as [WebSocket, WebSocket];
  const [client, webSocket] = pair;
  webSocket.accept();

  let address = "";
  let portWithRandomLog = "";
  const log = (info: string) => {
    console.log(`[${address}:${portWithRandomLog}] ${info}`);
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

  let remoteSocketWapper: { value: Socket | null } = { value: null };

  readableWebSocketStream.pipeTo(new WritableStream({
    async write(chunk: ArrayBuffer) {
      if (remoteSocketWapper.value) {
        const writer = (remoteSocketWapper.value as Socket).writable.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
        return;
      }

      const parsed = await parseTrojanHeader(chunk, env);
      const { hasError, message, portRemote = 443, addressRemote = "", rawClientData } = parsed;

      address = addressRemote;
      portWithRandomLog = `${portRemote}--${Math.random()} tcp`;

      if (hasError || !rawClientData) {
        throw new Error(message || "failed to parse header");
      }

      await handleTCPOutBound(remoteSocketWapper, addressRemote, portRemote, rawClientData, webSocket, env, log);
    },
    close() {
      log("readableWebSocketStream closed");
    },
    abort(reason: unknown) {
      log("readableWebSocketStream aborted: " + JSON.stringify(reason));
    },
  })).catch((err: Error) => {
    log("readableWebSocketStream pipeTo error: " + err.message);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function parseTrojanHeader(
  buffer: ArrayBuffer,
  env: Env,
): Promise<{
  hasError: boolean;
  message?: string;
  portRemote?: number;
  addressRemote?: string;
  rawClientData?: ArrayBuffer;
}> {
  if (buffer.byteLength < 58) {
    return { hasError: true, message: "invalid data: too short" };
  }

  const password = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 56)));

  if (new Uint8Array(buffer.slice(56, 57))[0] !== 0x0d ||
      new Uint8Array(buffer.slice(57, 58))[0] !== 0x0a) {
    return { hasError: true, message: "invalid header format (missing CR LF)" };
  }

  const user = await lookupTrojanUser(env, password);
  if (!user) {
    return { hasError: true, message: "invalid password" };
  }

  const socks5DataBuffer = buffer.slice(58);
  if (socks5DataBuffer.byteLength < 6) {
    return { hasError: true, message: "invalid SOCKS5 request data" };
  }

  const view = new DataView(socks5DataBuffer);
  const cmd = view.getUint8(0);
  if (cmd !== 1) {
    return { hasError: true, message: "unsupported command, only TCP (CONNECT) is allowed" };
  }

  const atype = view.getUint8(1);
  let addressLength = 0;
  let addressIndex = 2;
  let address = "";

  switch (atype) {
    case 1:
      addressLength = 4;
      address = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength)).join(".");
      break;
    case 3: {
      addressLength = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + 1))[0] || 0;
      addressIndex += 1;
      address = new TextDecoder().decode(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      break;
    }
    case 4: {
      addressLength = 16;
      const dataView = new DataView(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      const ipv6: string[] = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      address = ipv6.join(":");
      break;
    }
    default:
      return { hasError: true, message: `invalid addressType: ${atype}` };
  }

  if (!address) {
    return { hasError: true, message: "address is empty" };
  }

  const portIndex = addressIndex + addressLength;
  const portBuffer = socks5DataBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  return {
    hasError: false,
    addressRemote: address,
    portRemote,
    rawClientData: socks5DataBuffer.slice(portIndex + 4),
  };
}

async function handleTCPOutBound(
  remoteSocket: { value: Socket | null },
  addressRemote: string,
  portRemote: number,
  rawClientData: ArrayBuffer,
  webSocket: WebSocket,
  env: Env,
  log: (info: string) => void,
): Promise<void> {
  const proxyIP = env.PROXYIP || "";

  async function connectAndWrite(address: string, port: number): Promise<Socket> {
    const tcpSocket = connect({ hostname: address, port });
    remoteSocket.value = tcpSocket;
    log(`connected to ${address}:${port}`);
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData);
    writer.releaseLock();
    return tcpSocket;
  }

  async function retry() {
    const tcpSocket = await connectAndWrite(proxyIP || addressRemote, portRemote);
    tcpSocket.closed.catch(() => {}).finally(() => {
      safeCloseWebSocket(webSocket);
    });
    remoteSocketToWS(tcpSocket, webSocket, null, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);
  remoteSocketToWS(tcpSocket, webSocket, null, retry, log);
}
