// Stretch cards: a picture, an instruction and a timer for each move.
const MOVES = [
  ["🙆", "Neck rolls", "Slowly roll your head in a circle, 5 times each way.", 30],
  ["🤷", "Shoulder shrugs", "Lift shoulders to your ears, hold 2s, drop. ×10", 25],
  ["🧍", "Stand & reach", "Stand up, reach both arms to the ceiling, stretch tall.", 20],
  ["🙇", "Toe touch", "Stand and gently reach toward your toes. Breathe.", 30],
  ["🔄", "Seated twist", "Sit tall, twist to the right, hold. Then left.", 30],
  ["✋", "Wrist circles", "Circle your wrists 10× each way — typing hands need love.", 20],
  ["👀", "Eye palming", "Rub hands warm, cup them over closed eyes.", 20],
  ["🚶", "Walk it out", "Walk around the room or grab water.", 45],
];

export default {
  id: "stretch", emoji: "🤸", name: "Stretch cards",
  mount(el) {
    let i = 0, left = MOVES[0][3], h = null, running = false;
    const draw = () => {
      const [e, name, how, secs] = MOVES[i];
      el.innerHTML = `
        <div class="center stack">
          <div class="small" style="opacity:.75">${i + 1} / ${MOVES.length}</div>
          <div style="font-size:4rem;line-height:1">${e}</div>
          <h3 style="color:#fff">${name}</h3>
          <p>${how}</p>
          <div style="font-size:2rem;font-weight:800" class="mono">${left}s</div>
          <div class="bar gold" style="max-width:300px;margin:0 auto;width:100%"><i style="width:${(1 - left / secs) * 100}%"></i></div>
          <div class="row" style="justify-content:center">
            <button class="btn sm" data-prev ${i ? "" : "disabled"}>←</button>
            <button class="btn sm gold" data-go>${running ? "⏸ Pause" : "▶ Start"}</button>
            <button class="btn sm" data-next>${i < MOVES.length - 1 ? "Next →" : "Restart"}</button>
          </div>
        </div>`;
      el.querySelector("[data-go]").addEventListener("click", toggle);
      el.querySelector("[data-next]").addEventListener("click", () => go(i < MOVES.length - 1 ? i + 1 : 0));
      el.querySelector("[data-prev]").addEventListener("click", () => go(i - 1));
    };
    const go = (n) => { i = n; left = MOVES[i][3]; draw(); };
    const toggle = () => {
      running = !running;
      clearInterval(h);
      if (running) h = setInterval(() => {
        left--;
        if (left <= 0) {
          if (i < MOVES.length - 1) { i++; left = MOVES[i][3]; } else { running = false; clearInterval(h); left = 0; }
        }
        draw();
      }, 1000);
      draw();
    };
    draw();
    return () => clearInterval(h);
  },
};
