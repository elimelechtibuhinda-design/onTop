// Word of the day scramble: one study-flavoured word per day, plus extras.
import { dayOfYear, shuffle } from "../lib/utils.js";

const WORDS = [
  ["hypothesis", "A testable prediction"], ["variance", "How spread out data is"], ["algorithm", "Step-by-step procedure to solve a problem"],
  ["synthesis", "Combining parts into a whole"], ["mitochondria", "Powerhouse of the cell"], ["recursion", "A function that calls itself"],
  ["metaphor", "Saying one thing IS another"], ["equilibrium", "A state of balance"], ["photosynthesis", "Plants turning light into food"],
  ["democracy", "Government by the people"], ["integral", "Area under a curve"], ["catalyst", "Speeds up a reaction without being used up"],
  ["encapsulation", "Hiding an object's internal state"], ["inference", "A conclusion from evidence"], ["semester", "Half an academic year"],
  ["thesis", "The main claim of an essay"], ["momentum", "Mass times velocity"], ["ecosystem", "A community and its environment"],
  ["derivative", "Instantaneous rate of change"], ["citation", "Credit to a source"], ["polymorphism", "Many forms, one interface"],
  ["correlation", "How two variables move together"], ["osmosis", "Water moving across a membrane"], ["paradigm", "A model or pattern of thinking"],
  ["thunderbird", "UBC's mascot 💙💛"], ["empirical", "Based on observation"], ["syllabus", "The course outline you should read"],
  ["iteration", "One pass of a repeated process"], ["abstraction", "Hiding detail to manage complexity"], ["confidence", "Interval or feeling — both help on exams"],
];

const scramble = (w) => {
  let s = w;
  for (let i = 0; i < 10 && s === w; i++) s = shuffle(w.split("")).join("");
  return s;
};

export default {
  id: "scramble", emoji: "🧩", name: "Word scramble",
  mount(el) {
    let idx = dayOfYear() % WORDS.length, solved = false, hints = 0, scr = scramble(WORDS[idx][0]);
    const draw = (msg = "") => {
      const [word, def] = WORDS[idx];
      el.innerHTML = `
        <div class="center stack">
          <div class="small" style="opacity:.75">${idx === dayOfYear() % WORDS.length ? "Word of the day" : "Bonus word"} · Hint: ${def}</div>
          <div style="font-size:2rem;font-weight:800;letter-spacing:.25em;text-transform:uppercase">${solved ? word : scr}</div>
          ${solved ? `<div><b>🎉 Nice!</b></div><div><button class="btn sm" data-next>Another word</button></div>` : `
          <div class="row" style="max-width:360px;margin:0 auto;width:100%">
            <input type="text" data-guess placeholder="Your answer" autocomplete="off" class="grow" style="background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.25)">
            <button class="btn sm gold" data-check>Check</button></div>
          <div class="small">${hints ? `Starts with: <b>${word.slice(0, hints).toUpperCase()}</b>` : ""} <button class="btn sm ghost" data-hint style="color:#fff">💡 Hint</button> <button class="btn sm ghost" data-reshuffle style="color:#fff">🔀 Reshuffle</button></div>
          <div class="small" style="min-height:1.2em">${msg}</div>`}
        </div>`;
      const input = el.querySelector("[data-guess]");
      const check = () => {
        if (input.value.trim().toLowerCase() === word) { solved = true; draw(); }
        else draw("Not quite — try again!");
      };
      el.querySelector("[data-check]")?.addEventListener("click", check);
      input?.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
      input?.focus();
      el.querySelector("[data-hint]")?.addEventListener("click", () => { hints = Math.min(word.length - 1, hints + 1); draw(); });
      el.querySelector("[data-reshuffle]")?.addEventListener("click", () => { scr = scramble(word); draw(); });
      el.querySelector("[data-next]")?.addEventListener("click", () => {
        idx = (idx + 1 + Math.floor(Math.random() * (WORDS.length - 1))) % WORDS.length;
        solved = false; hints = 0; scr = scramble(WORDS[idx][0]); draw();
      });
    };
    draw();
    return () => {};
  },
};
