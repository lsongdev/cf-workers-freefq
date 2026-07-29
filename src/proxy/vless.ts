import { connect } from "cloudflare:sockets";
import {
  WS_READY_STATE_OPEN,
  makeReadableWebSocketStream,
  remoteSocketToWS,
  safeCloseWebSocket,
  lookupVlessUser,
} from "./common";

const hexTbl: string[] = [];
for (let i = 0; i < 256; ++i) {
  hexTbl.push((i + 256).toString(16).slice(1));
}

function fmtUUID(arr: Uint8Array, offset = 0): string {
  const g = (i: number) => hexTbl[arr[offset + i]!]!;
  return (g(0) + g(1) + g(2) + g(3) + "-" + g(4) + g(5) + "-" + g(6) + g(7) + "-" +
    g(8) + g(9) + "-" + g(10) + g(11) + g(12) + g(13) + g(14) + g(15)).toLowerCase();
}

async function handleUDPOutBound(webSocket: WebSocket, vlessResponseHeader: Uint8Array, log: (info: string) => void): Promise<{ write: (chunk: ArrayBuffer) => void }> {
  let isVlessHeaderSent = false;

  const transformStream = new TransformStream({
    transform(chunk: ArrayBuffer, controller: TransformStreamDefaultController) {
      for (let index = 0; index < chunk.byteLength;) {
        const udpPacketLength = new DataView(chunk.slice(index, index + 2)).getUint16(0);
        const udpData = new Uint8Array(chunk.slice(index + 2, index + 2 + udpPacketLength));
        index = index + 2 + udpPacketLength;
        controller.enqueue(udpData);
      }
    },
  });

  const dnsStream = new WritableStream({
    async write(chunk: ArrayBuffer) {
      const resp = await fetch("https://1.1.1.1/dns-query", {
        method: "POST",
        headers: { "content-type": "application/dns-message" },
        body: chunk,
      });
      const dnsQueryResult = await resp.arrayBuffer();
      const udpSize = dnsQueryResult.byteLength;
      const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);
      if (webSocket.readyState === WS_READY_STATE_OPEN) {
        log(`doh success, dns message length: ${udpSize}`);
        if (isVlessHeaderSent) {
          webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
        } else {
          webSocket.send(await new Blob([vlessResponseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
          isVlessHeaderSent = true;
        }
      }
    },
  });

  transformStream.readable.pipeTo(dnsStream).catch((error: Error) => {
    log("dns udp error: " + error.message);
  });

  const writer = transformStream.writable.getWriter();
  return {
    write(chunk: ArrayBuffer) {
      writer.write(chunk);
    },
  };
}

export async function vlessOverWSHandler(request: Request, env: Env): Promise<Response> {
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
  let udpStreamWrite: ((chunk: ArrayBuffer) => void) | null = null;
  let isDns = false;

  readableWebSocketStream.pipeTo(new WritableStream({
    async write(chunk: ArrayBuffer) {
      if (isDns && udpStreamWrite) {
        return udpStreamWrite(chunk);
      }
      if (remoteSocketWapper.value) {
        const writer = (remoteSocketWapper.value as Socket).writable.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
        return;
      }

      const parsed = await parseVlessHeader(chunk, env);
      const { hasError, message, portRemote = 443, addressRemote = "", rawDataIndex = 0, vlessVersion = new Uint8Array([0, 0]), isUDP = false } = parsed;

      address = addressRemote;
      portWithRandomLog = `${portRemote}--${Math.random()} ${isUDP ? "udp " : "tcp "}`;

      if (hasError) {
        throw new Error(message);
      }

      if (isUDP) {
        if (portRemote === 53) {
          isDns = true;
        } else {
          throw new Error("UDP proxy only enabled for DNS (port 53)");
        }
      }

      const vlessResponseHeader = new Uint8Array([vlessVersion[0] || 0, 0]);
      const rawClientData = chunk.slice(rawDataIndex);

      if (isDns) {
        const { write } = await handleUDPOutBound(webSocket, vlessResponseHeader, log);
        udpStreamWrite = write;
        udpStreamWrite(rawClientData);
        return;
      }

      await handleTCPOutBound(remoteSocketWapper, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, env, log);
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

async function parseVlessHeader(
  buffer: ArrayBuffer,
  env: Env,
): Promise<{
  hasError: boolean;
  message?: string;
  portRemote?: number;
  addressRemote?: string;
  rawDataIndex?: number;
  vlessVersion?: Uint8Array;
  isUDP?: boolean;
}> {
  if (buffer.byteLength < 24) {
    return { hasError: true, message: "invalid data" };
  }

  const version = new Uint8Array(buffer.slice(0, 1));
  const receivedUUID = fmtUUID(new Uint8Array(buffer.slice(1, 17)));

  const user = await lookupVlessUser(env, receivedUUID);
  if (!user) {
    return { hasError: true, message: "invalid user" };
  }

  const optLength = new Uint8Array(buffer.slice(17, 18))[0] || 0;
  const command = new Uint8Array(buffer.slice(18 + optLength, 18 + optLength + 1))[0];

  let isUDP = false;
  if (command === 1) {
  } else if (command === 2) {
    isUDP = true;
  } else {
    return { hasError: true, message: `command ${command} is not supported` };
  }

  const portIndex = 18 + optLength + 1;
  const portBuffer = buffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  let addressIndex = portIndex + 2;
  const addressType = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1))[0] || 0;

  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";

  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 2: {
      addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0] || 0;
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    }
    case 3: {
      addressLength = 16;
      const dataView = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6: string[] = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    }
    default:
      return { hasError: true, message: `invalid addressType: ${addressType}` };
  }

  if (!addressValue) {
    return { hasError: true, message: "address is empty" };
  }

  return {
    hasError: false,
    addressRemote: addressValue,
    portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    vlessVersion: version,
    isUDP,
  };
}

async function handleTCPOutBound(
  remoteSocket: { value: Socket | null },
  addressRemote: string,
  portRemote: number,
  rawClientData: ArrayBuffer,
  webSocket: WebSocket,
  vlessResponseHeader: Uint8Array,
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
    remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);
  remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log);
}
