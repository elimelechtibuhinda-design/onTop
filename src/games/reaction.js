// Reaction tap: wait for green, tap as fast as you can.
import { update, S } from "../lib/store.js";

export default {
  id: "reaction", emoji: "🎯", name: "Reaction tap",
  mount(el) {
    let state = "idle", t0 = 0, h = null, last = null, tries = [];
    const draw = () => {
      const best = S().records.reaction;
      const cfg = {
        idle: ["#0055B7", "Tap to start"],
        wait: ["#C0392B", "Wait for green…"],
        go: ["#2E8B57", "TAP!"],
        early: ["#C27B00", "Too soon! Tap to retry"],
        result: ["#0055B7", `${last} ms — tap to go again`],
      }[state];
      el.innerHTML = `
        <div class="row between" style="margin-bottom:10px"><span>Best: <b>${best ? best + " ms" : "—"}</b></span>
          <span class="small" style="opacity:.75">${tries.length ? "Avg " + Math.round(tries.reduce((a, b) => a + b, 0) / tries.length) + " ms" : ""}</span></div>
        <button data-pad style="width:100%;height:220px;border:0;border-radius:18px;font-size:1.5rem;font-weight:800;color:#fff;cursor:pointer;background:${cfg[0]}">${cfg[1]}</button>`;
      el.querySelector("[data-pad]").addEventListener("pointerdown", tap);
    };
    const tap = () => {
      if (state === "idle" || state === "early" || state === "result") {
        state = "wait"; draw();
        h = setTimeout(() => { state = "go"; t0 = performance.now(); draw(); }, 1200 + Math.random() * 2500);
      } else if (state === "wait") {
        clearTimeout(h); state = "early"; draw();
      } else if (state === "go") {
        last = Math.round(performance.now() - t0);
        tries.push(last);
        if (!S().records.reaction || last < S().records.reaction) update((st) => { st.records.reaction = last; });
        state = "result"; draw();
      }
    };
    draw();
    return () => clearTimeout(h);
  },
};
