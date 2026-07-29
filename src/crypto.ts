const encoder = new TextEncoder();

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

export function randomHex(bytes = 16): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return hex(value);
}

export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

const R = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const IV = new Uint32Array([
  0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
  0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4,
]);

function rr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export async function sha224(value: string): Promise<string> {
  const msg = encoder.encode(value);
  const bitLen = msg.length * 8;
  const padLen = (((msg.length + 9 + 63) / 64) | 0) * 64;
  const pad = new Uint8Array(padLen);
  pad.set(msg);
  pad[msg.length] = 0x80;
  const dv = new DataView(pad.buffer, pad.byteOffset, pad.byteLength);
  dv.setUint32(padLen - 4, bitLen >>> 32, false);
  dv.setUint32(padLen - 8, bitLen & 0xffffffff, false);
  const W = new Uint32Array(64);
  const H = new Uint32Array(IV);
  for (let b = 0; b < padLen; b += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(b + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rr(W[t - 15]!, 7) ^ rr(W[t - 15]!, 18) ^ (W[t - 15]! >>> 3);
      const s1 = rr(W[t - 2]!, 17) ^ rr(W[t - 2]!, 19) ^ (W[t - 2]! >>> 10);
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
    }
    let a = H[0]!, b2 = H[1]!, c = H[2]!, d = H[3]!;
    let e = H[4]!, f2 = H[5]!, g = H[6]!, h2 = H[7]!;
    for (let t = 0; t < 64; t++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f2) ^ (~e & g);
      const t1 = (h2 + S1 + ch + R[t]! + W[t]!) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b2) ^ (a & c) ^ (b2 & c);
      const t2 = (S0 + maj) >>> 0;
      h2 = g; g = f2; f2 = e;
      e = (d + t1) >>> 0;
      d = c; c = b2; b2 = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b2) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f2) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h2) >>> 0;
  }
  const out = new Uint8Array(28);
  for (let i = 0; i < 7; i++) {
    out[i * 4] = (H[i]! >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i]! >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i]! >>> 8) & 0xff;
    out[i * 4 + 3] = H[i]! & 0xff;
  }
  return hex(out);
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}
