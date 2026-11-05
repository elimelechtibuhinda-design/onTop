// Renders public/og-image.png (1200×630): the preview card shown when the link is shared.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const icon = await sharp(readFileSync(new URL("../public/icon.svg", import.meta.url))).resize(220, 220).png().toBuffer();
const font = "Helvetica Neue, Helvetica, Arial, sans-serif";
const chips = ["Focus timer", "Exam planner", "Flashcards", "Calm music"];
const chipW = 230;
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><radialGradient id="g" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#0b3a75"/><stop offset=".6" stop-color="#002145"/><stop offset="1" stop-color="#00122a"/></radialGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="340" y="200" font-family="${font}" font-size="88" font-weight="800" fill="#fff">Dialed In</text>
  <text x="340" y="262" font-family="${font}" font-size="38" font-weight="600" fill="#F2A900">The free study app for students</text>
  <text x="340" y="318" font-family="${font}" font-size="28" fill="#c9d8ea">Focus, plan and track your distractions.</text>
  ${chips.map((c, i) => `<rect x="${80 + i * (chipW + 22)}" y="420" width="${chipW}" height="64" rx="32" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.25)"/>
  <text x="${80 + i * (chipW + 22) + chipW / 2}" y="461" text-anchor="middle" font-family="${font}" font-size="26" font-weight="700" fill="#fff">${c}</text>`).join("")}
  <text x="80" y="566" font-family="${font}" font-size="28" font-weight="700" fill="#97D4E9">imdialedin.app</text>
  <text x="1120" y="566" text-anchor="end" font-family="${font}" font-size="26" fill="#c9d8ea">No account · No email · Free</text>
</svg>`;
await sharp(Buffer.from(bg)).composite([{ input: icon, top: 90, left: 80 }]).png().toFile(new URL("../public/og-image.png", import.meta.url).pathname);
console.log("og-image.png written");
