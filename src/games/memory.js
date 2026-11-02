// Memory match: 6 pairs, 60 seconds.
import { update, S } from "../lib/store.js";
import { shuffle } from "../lib/utils.js";

const EMOJI = ["📚", "🧠", "✏️", "🔬", "🎓", "💡", "🧪", "📐", "🌲", "🦉", "☕", "🧮"];

export default {
  id: "memory", emoji: "🧠", name: "Memory match",
  mount(el) {
    let cards, open, matched, moves, left, h, locked;
    const start = () => {
      const pick = shuffle(EMOJI).slice(0, 6);
      cards = shuffle([...pick, ...pick]).map((e, i) => ({ e, i }));
      open = []; matched = new Set(); moves = 0; left = 60; locked = false;
      clearInterval(h);
      h = setInterval(() => { left--; draw(); if (left <= 0) { clearInterval(h); locked = true; draw(); } }, 1000);
      draw();
    };
    const draw = () => {
      const won = matched.size === 12;
      const best = S().records.memory;
      el.innerHTML = `
        <div class="row between" style="margin-bottom:10px"><span>⏱ ${left}s · ${moves} moves</span><span class="small" style="opacity:.75">Best: ${best ? best + "s" : "—"}</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:360px;margin:0 auto">
          ${cards.map((c, i) => {
            const show = open.includes(i) || matched.has(i);
            return `<button data-i="${i}" style="aspect-ratio:1;border-radius:12px;border:0;font-size:1.8rem;cursor:pointer;
              background:${matched.has(i) ? "#2E8B57" : show ? "#fff" : "#0055B7"};color:#000">${show ? c.e : ""}</button>`;
          }).join("")}
        </div>
        ${won || left <= 0 ? `<div class="center" style="margin-top:12px"><b>${won ? `Cleared in ${60 - left}s! 🎉` : "Time! 🕐"}</b><br><button class="btn sm" data-again style="margin-top:8px">Play again</button></div>` : ""}`;
      el.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => flip(+b.dataset.i)));
      el.querySelector("[data-again]")?.addEventListener("click", start);
    };
    const flip = (i) => {
      if (locked || matched.has(i) || open.includes(i) || open.length === 2) return;
      open.push(i);
      if (open.length === 2) {
        moves++;
        const [a, b] = open;
        if (cards[a].e === cards[b].e) {
          matched.add(a); matched.add(b); open = [];
          if (matched.size === 12) {
            clearInterval(h);
            const t = 60 - left;
            update((st) => { if (!st.records.memory || t < st.records.memory) st.records.memory = t; });
          }
        } else setTimeout(() => { open = []; draw(); }, 700);
      }
      draw();
    };
    start();
    return () => clearInterval(h);
  },
};
