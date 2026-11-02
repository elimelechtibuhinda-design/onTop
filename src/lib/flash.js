// Leitner-box scheduling shared by flashcards and spaced review.
import { update } from "./store.js";
import { addDays, todayKey } from "./utils.js";

export const CARD_INTERVALS = [0, 1, 2, 4, 8, 16, 32];   // days, by box
export const REVIEW_INTERVALS = [1, 3, 7, 14];          // spaced review after first study

export function gradeCard(id, gotIt) {
  update((st) => {
    const c = st.flashcards.find((x) => x.id === id);
    if (!c) return;
    c.box = gotIt ? Math.min((c.box || 0) + 1, CARD_INTERVALS.length - 1) : 0;
    c.due = addDays(todayKey(), CARD_INTERVALS[c.box]);
  });
}

// Mark a spaced-review topic reviewed and schedule the next one (1 → 3 → 7 → 14 days).
export function completeReview(id) {
  update((st) => {
    const r = st.reviews.find((x) => x.id === id);
    if (!r) return;
    r.stage = (r.stage || 0) + 1;
    if (r.stage >= REVIEW_INTERVALS.length) { r.done = true; return; }
    r.due = addDays(r.learnedOn, REVIEW_INTERVALS[r.stage]);
    if (r.due <= todayKey()) r.due = addDays(todayKey(), 1);
  });
}
