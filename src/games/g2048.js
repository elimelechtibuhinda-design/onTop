// 2048 mini: arrow keys or swipe. The board closes when the break ends.
import { update, S } from "../lib/store.js";

const COLORS = { 2: "#eef3f9", 4: "#dbe8f8", 8: "#97D4E9", 16: "#6EC4E8", 32: "#40B4E5", 64: "#00A7E1", 128: "#0055B7", 256: "#003d85", 512: "#002145", 1024: "#F2A900", 2048: "#ffcc33" };

export default {
  id: "2048", emoji: "🔢", name: "2048 mini",
  mount(el, ctx) {
    let grid = Array(16).fill(0), score = 0, over = false;
    const add = () => {
      const empty = grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      if (!empty.length) return;
      grid[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
    };
    const lineMove = (line) => {
      const vals = line.filter(Boolean);
      for (let i = 0; i < vals.length - 1; i++) {
        if (vals[i] === vals[i + 1]) { vals[i] *= 2; score += vals[i]; vals.splice(i + 1, 1); }
      }
      while (vals.length < 4) vals.push(0);
      return vals;
    };
    const move = (dir) => {
      if (over) return;
      const before = grid.join();
      for (let k = 0; k < 4; k++) {
        const idx = [0, 1, 2, 3].map((j) => (dir === "left" || dir === "right") ? k * 4 + j : j * 4 + k);
        if (dir === "right" || dir === "down") idx.reverse();
        lineMove(idx.map((i) => grid[i])).forEach((v, j) => { grid[idx[j]] = v; });
      }
      if (grid.join() !== before) add();
      if (!canMove()) over = true;
      if (score > S().records.g2048) update((st) => { st.records.g2048 = score; });
      draw();
    };
    const canMove = () => grid.some((v, i) => !v || (i % 4 < 3 && v === grid[i + 1]) || (i < 12 && v === grid[i + 4]));
    const draw = () => {
      el.innerHTML = `
        <div class="row between" style="margin-bottom:10px"><span>Score <b>${score}</b></span>
          <span class="small" style="opacity:.75">Best ${S().records.g2048} · ⏱ ${Math.ceil(ctx.secondsLeft() / 60)} min left</span></div>
        <div data-board tabindex="0" aria-label="2048 board, use arrow keys" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-width:320px;margin:0 auto;
          background:#0b2a4d;padding:6px;border-radius:12px;touch-action:none;outline:none">
          ${grid.map((v) => `<div style="aspect-ratio:1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;
            font-size:${v >= 1024 ? "1.1rem" : "1.4rem"};background:${v ? COLORS[v] || "#F2A900" : "rgba(255,255,255,.06)"};color:${v >= 128 ? "#fff" : "#002145"}">${v || ""}</div>`).join("")}
        </div>
        <div class="center" style="margin-top:10px">
          ${over ? `<b>No moves left!</b> ` : `<span class="small" style="opacity:.75">Arrow keys or swipe</span> `}
          <button class="btn sm" data-new>New game</button></div>`;
      const board = el.querySelector("[data-board]");
      board.focus({ preventScroll: true });
      let sx, sy;
      board.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      board.addEventListener("touchend", (e) => {
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
      });
      el.querySelector("[data-new]").addEventListener("click", reset);
    };
    const onKey = (e) => {
      const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    };
    const reset = () => { grid = Array(16).fill(0); score = 0; over = false; add(); add(); draw(); };
    document.addEventListener("keydown", onKey);
    reset();
    return () => document.removeEventListener("keydown", onKey);
  },
};
