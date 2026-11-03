// Shared flashcard face: text with $formulas$ (KaTeX, loaded only when needed) and an optional image.
// faceHTML() returns markup immediately; hydrate() fills in formulas and pictures afterwards.
import { esc } from "../lib/utils.js";
import { imageURL } from "../lib/images.js";
import { openDialog } from "./ui.js";

const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
export const hasMath = (t) => /\$[^$\n]+?\$/.test(t || "");

// Text → HTML with math placeholders. "\$" stays a literal dollar sign.
export function richText(text) {
  const src = String(text || "").replace(/\\\$/g, "\u0000");
  return src.split(MATH).map((part) => {
    if (/^\$\$[\s\S]+\$\$$/.test(part)) return `<span class="tex" data-tex="${esc(part.slice(2, -2))}" data-display="1"></span>`;
    if (/^\$[^$\n]+\$$/.test(part)) return `<span class="tex" data-tex="${esc(part.slice(1, -1))}"></span>`;
    return esc(part).replace(/\u0000/g, "$").replace(/\n/g, "<br>");
  }).join("");
}

export function faceHTML(text, imgId) {
  return `<div class="cf">${imgId ? `<img class="cf-img" data-img="${esc(imgId)}" alt="Card picture (tap to zoom)">` : ""}${text ? `<div class="cf-text">${richText(text)}</div>` : ""}</div>`;
}

let katexP = null;
function loadKatex() {
  katexP ||= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => m.default);
  return katexP;
}

export async function hydrate(root) {
  const texEls = root.querySelectorAll("[data-tex]:not([data-done])");
  if (texEls.length) {
    const katex = await loadKatex();
    texEls.forEach((el) => {
      el.dataset.done = "1";
      katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: el.dataset.display === "1", output: "html" });
    });
  }
  for (const img of root.querySelectorAll("img[data-img]:not([src])")) {
    const url = await imageURL(img.dataset.img);
    if (url) img.src = url;
    else img.replaceWith(Object.assign(document.createElement("div"), { className: "cf-missing", textContent: "🖼️ Picture still syncing…" }));
  }
  root.querySelectorAll("img.cf-img:not([data-zoom])").forEach((img) => {
    img.dataset.zoom = "1";
    img.addEventListener("click", (e) => { e.stopPropagation(); zoom(img.src); });
  });
}

export function zoom(src) {
  if (!src) return;
  openDialog(`<img src="${src}" alt="Card picture" style="width:100%;height:auto;border-radius:12px;background:#fff"><div class="dlg-actions"><button class="btn" data-close>Close</button></div>`);
}
