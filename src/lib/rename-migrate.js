// One-time move from the app's old name (onTop) to Dialed In. Imported first in main.js so it runs
// before any module reads localStorage. The IndexedDB move happens in db.js.
for (const k of ["timer", "view", "music"]) {
  try {
    const old = localStorage.getItem(`ontop-${k}`);
    if (old !== null && localStorage.getItem(`dialedin-${k}`) === null) localStorage.setItem(`dialedin-${k}`, old);
    localStorage.removeItem(`ontop-${k}`);
  } catch { /* storage blocked */ }
}
try { localStorage.removeItem("ontop-mix"); localStorage.removeItem("ontop-piano"); } catch { /* ignore */ }
