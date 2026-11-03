// End-to-end encryption for sync. The sync code never leaves the device: from it we derive
// (1) an id the server files the data under and (2) an AES key the server never sees.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";   // Crockford base32: no I, L, O, U

// 16 random characters ≈ 80 bits, shown as XXXX-XXXX-XXXX-XXXX.
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
  return chars.match(/.{4}/g).join("-");
}

// Forgiving input: lowercase, spaces, O→0, I/L→1 all accepted.
export function normalizeCode(input) {
  const c = String(input || "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1").replace(/[^0-9A-Z]/g, "");
  if (c.length !== 16 || [...c].some((ch) => !ALPHABET.includes(ch))) return null;
  return c.match(/.{4}/g).join("-");
}

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (buf) => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function deriveKeys(code) {
  const material = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("dialedin-sync-v1"), iterations: 200000 }, material, 512);
  const all = new Uint8Array(bits);
  const key = await crypto.subtle.importKey("raw", all.slice(32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { id: hex(all.slice(0, 32)), key };
}

async function gzip(bytes) {
  if (typeof CompressionStream === "undefined") return { z: false, bytes };
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return { z: true, bytes: new Uint8Array(out) };
}
async function gunzip(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

// Format: base64( 1 byte flags | 12 byte iv | ciphertext )
export async function encryptState(key, obj) {
  const { z, bytes } = await gzip(enc.encode(JSON.stringify(obj)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = z ? 1 : 0; out.set(iv, 1); out.set(ct, 13);
  return b64(out);
}
export async function decryptState(key, data) {
  const all = unb64(data);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(1, 13) }, key, all.slice(13)));
  const bytes = all[0] === 1 ? await gunzip(plain) : plain;
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Pictures: already compressed, so no gzip. Plain layout: 1 byte type length | type | image bytes.
export async function encryptBytes(key, bytes, type) {
  const t = enc.encode(type || "image/jpeg");
  const plain = new Uint8Array(1 + t.length + bytes.byteLength);
  plain[0] = t.length; plain.set(t, 1); plain.set(new Uint8Array(bytes), 1 + t.length);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = 2; out.set(iv, 1); out.set(ct, 13);
  return b64(out);
}
export async function decryptBytes(key, data) {
  const all = unb64(data);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(1, 13) }, key, all.slice(13)));
  const tl = plain[0];
  return { type: new TextDecoder().decode(plain.slice(1, 1 + tl)), bytes: plain.slice(1 + tl) };
}
