// Quiz-yourself flashcards: a light review using the student's own cards.
import { S } from "../lib/store.js";
import { esc, todayKey, shuffle } from "../lib/utils.js";
import { gradeCard } from "../lib/flash.js";
import { courseName } from "../lib/queries.js";

export default {
  id: "flash", emoji: "📚", name: "Flashcards",
  mount(el) {
    const all = S().flashcards;
    const due = all.filter((c) => c.due <= todayKey());
    let deck = shuffle(due.length ? due : all).slice(0, 15), i = 0, flipped = false, got = 0;
    const draw = () => {
      if (!all.length) {
        el.innerHTML = `<p class="center">No flashcards yet. Add some under <b>Plan → Courses</b>, then come back on your next break. 📚</p>`;
        return;
      }
      if (i >= deck.length) {
        el.innerHTML = `<div class="center stack"><div style="font-size:2.5rem">🎉</div><b>${got} / ${deck.length} correct</b><button class="btn sm" data-again>Go again</button></div>`;
        el.querySelector("[data-again]").addEventListener("click", () => { deck = shuffle(all).slice(0, 15); i = 0; got = 0; flipped = false; draw(); });
        return;
      }
      const c = deck[i];
      el.innerHTML = `
        <div class="stack">
          <div class="small center" style="opacity:.75">${i + 1} / ${deck.length} · ${esc(courseName(c.courseId))}${due.length ? " · due today" : ""}</div>
          <div class="flashcard ${flipped ? "flipped" : ""}" data-card role="button" tabindex="0" aria-label="Flashcard, tap to flip">
            <div class="inner"><div class="face">${esc(c.front)}</div><div class="face back">${esc(c.back)}</div></div>
          </div>
          ${flipped ? `<div class="row" style="justify-content:center"><button class="btn sm" data-no>↺ Again</button><button class="btn sm gold" data-yes>✓ Got it</button></div>`
            : `<p class="center small" style="opacity:.75">Tap the card to flip</p>`}
        </div>`;
      const card = el.querySelector("[data-card]");
      const flip = () => { flipped = !flipped; draw(); };
      card.addEventListener("click", flip);
      card.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
      el.querySelector("[data-yes]")?.addEventListener("click", () => { gradeCard(c.id, true); got++; i++; flipped = false; draw(); });
      el.querySelector("[data-no]")?.addEventListener("click", () => { gradeCard(c.id, false); i++; flipped = false; draw(); });
    };
    draw();
    return () => {};
  },
};
