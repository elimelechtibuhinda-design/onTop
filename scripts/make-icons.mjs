// Renders public/icon.svg into the PNG sizes browsers need to install the app.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icon.svg", import.meta.url));
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;

for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(out(`icon-${size}.png`));
}
// Maskable icon: same art with safe-zone padding on the brand blue.
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#002145" } })
  .composite([{ input: await sharp(svg).resize(400, 400).png().toBuffer(), top: 56, left: 56 }])
  .png().toFile(out("icon-maskable-512.png"));
await sharp(svg).resize(180, 180).png().toFile(out("apple-touch-icon.png"));
console.log("icons written");
