// Flashcard images: shrink on the device, store in IndexedDB, hand out object URLs for display.
import { imageGet, imagePut, imageDelete, imageKeys, imageAll } from "./db.js";
import { S } from "./store.js";
import { uid } from "./utils.js";

export const MAX_IMAGES = 500;
const MAX_SIDE = 1200;          // px, longest side
const TARGET_BYTES = 180_000;   // aim for ≤ ~180 KB per image

let webpOK = null;
async function canWebp() {
  if (webpOK !== null) return webpOK;
  const c = document.createElement("canvas"); c.width = c.height = 1;
  const b = await new Promise((r) => c.toBlob(r, "image/webp", 0.8));
  return (webpOK = !!b && b.type === "image/webp");
}

// Resize + re-encode so a 4 MB phone photo becomes ~100 KB. Returns { blob, w, h }.
export async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  let w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const type = (await canWebp()) ? "image/webp" : "image/jpeg";
  let blob = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);        // flatten transparency (JPEG has none)
    g.drawImage(bmp, 0, 0, w, h);
    blob = await new Promise((r) => c.toBlob(r, type, attempt === 0 ? 0.8 : 0.7));
    if (blob.size <= TARGET_BYTES) break;
    w = Math.round(w * 0.8); h = Math.round(h * 0.8);
  }
  bmp.close?.();
  return { blob, w, h };
}

export function imageCount() {
  return S().flashcards.reduce((n, c) => n + (c.frontImg ? 1 : 0) + (c.backImg ? 1 : 0), 0);
}

export async function addImage(file) {
  if (imageCount() >= MAX_IMAGES) throw new Error("limit");
  const { blob, w, h } = await shrink(file);
  const id = uid() + uid();
  await imagePut({ id, blob, type: blob.type, w, h, createdAt: Date.now(), uploaded: false });
  return id;
}

const urls = new Map();
export async function imageURL(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const rec = await imageGet(id);
  if (!rec) return null;
  const u = URL.createObjectURL(rec.blob);
  urls.set(id, u);
  return u;
}

export async function removeImage(id) {
  if (!id) return;
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  await imageDelete(id).catch(() => {});
}

// Images no card points to any more (card deleted, picture replaced).
export async function unusedImageIds() {
  const used = new Set();
  for (const c of S().flashcards) { if (c.frontImg) used.add(c.frontImg); if (c.backImg) used.add(c.backImg); }
  // Pictures added in the last hour may belong to a card that's still being written.
  const recent = new Set((await imageAll()).filter((r) => Date.now() - (r.createdAt || 0) < 3600000).map((r) => r.id));
  return (await imageKeys()).filter((id) => !used.has(id) && !recent.has(id));
}
export const referencedImageIds = () => {
  const ids = new Set();
  for (const c of S().flashcards) { if (c.frontImg) ids.add(c.frontImg); if (c.backImg) ids.add(c.backImg); }
  return [...ids];
};
