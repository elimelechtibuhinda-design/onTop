// Doodle pad: draw anything; save to the "break art" gallery (stored in IndexedDB).
import { doodlePut } from "../lib/db.js";
import { uid } from "../lib/utils.js";
import { toast } from "../components/ui.js";

const COLORS = ["#002145", "#0055B7", "#00A7E1", "#F2A900", "#2E8B57", "#C0392B", "#7C5CBF", "#ffffff"];

export default {
  id: "doodle", emoji: "✏️", name: "Doodle pad",
  mount(el) {
    el.innerHTML = `
      <div class="row wrap" style="margin-bottom:8px;gap:6px">
        ${COLORS.map((c, i) => `<button data-c="${c}" aria-label="Colour ${c}" style="width:28px;height:28px;border-radius:50%;border:3px solid ${i ? "transparent" : "#F2A900"};background:${c};cursor:pointer"></button>`).join("")}
        <input type="range" min="2" max="24" value="5" data-size aria-label="Brush size" style="width:100px;accent-color:#F2A900">
        <button class="btn sm" data-clear>Clear</button>
        <button class="btn sm gold" data-save>Save to gallery</button>
      </div>
      <canvas data-cv style="width:100%;height:300px;background:#fff;border-radius:14px;touch-action:none;cursor:crosshair;display:block"></canvas>`;
    const cv = el.querySelector("[data-cv]");
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr); g.lineCap = "round"; g.lineJoin = "round";
    g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    let color = COLORS[0], size = 5, drawing = false, lx = 0, ly = 0, dirty = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener("pointerdown", (e) => { drawing = true; [lx, ly] = pos(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const [x, y] = pos(e);
      g.strokeStyle = color; g.lineWidth = size;
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke();
      lx = x; ly = y; dirty = true;
    });
    const stop = () => { drawing = false; };
    cv.addEventListener("pointerup", stop); cv.addEventListener("pointercancel", stop);
    el.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
      color = b.dataset.c;
      el.querySelectorAll("[data-c]").forEach((x) => { x.style.borderColor = x === b ? "#F2A900" : "transparent"; });
    }));
    el.querySelector("[data-size]").addEventListener("input", (e) => { size = +e.target.value; });
    el.querySelector("[data-clear]").addEventListener("click", () => { g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); dirty = false; });
    const save = async () => {
      if (!dirty) return toast("Draw something first ✏️");
      await doodlePut({ id: uid(), createdAt: Date.now(), data: cv.toDataURL("image/png") });
      dirty = false;
      toast("Saved to your break-art gallery 🖼️ (Me tab)");
    };
    el.querySelector("[data-save]").addEventListener("click", save);
    return () => {};
  },
};
