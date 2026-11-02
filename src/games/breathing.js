// Breathing bubble: 4s in, 4s hold, 4s out, 4s hold.
const PHASES = [
  { text: "Breathe in…", scale: 1 },
  { text: "Hold", scale: 1 },
  { text: "Breathe out…", scale: 0.45 },
  { text: "Hold", scale: 0.45 },
];

export default {
  id: "breathing", emoji: "🫁", name: "Breathing bubble",
  mount(el) {
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:18px;padding:10px 0">
        <div data-b style="width:200px;height:200px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#97D4E9,#00A7E1 60%,#0055B7);
          transform:scale(.45);transition:transform 4s ease-in-out;box-shadow:0 0 60px rgba(0,167,225,.5)"></div>
        <div data-t style="font-size:1.4rem;font-weight:700">Get comfy…</div>
        <div data-c class="small" style="opacity:.75">Great before exams. Follow the bubble.</div>
      </div>`;
    const b = el.querySelector("[data-b]"), t = el.querySelector("[data-t]"), c = el.querySelector("[data-c]");
    let i = 0, cycles = 0;
    const step = () => {
      const p = PHASES[i % 4];
      t.textContent = p.text;
      b.style.transform = `scale(${p.scale})`;
      if (i % 4 === 0 && i) { cycles++; c.textContent = `${cycles} breath${cycles > 1 ? "s" : ""} done 💙`; }
      i++;
    };
    step();
    const h = setInterval(step, 4000);
    return () => clearInterval(h);
  },
};
