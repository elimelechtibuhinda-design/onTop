# Dialed In 🦉

A study tracker for students: plan with SMART goals, focus with a timer, take real breaks.
No sign-in. Everything is stored in the browser on your own device.

Made with 💙💛 for students everywhere.

## What's inside

- **Today**: one-tap Start, daily goal ring, streak with a weekly freeze, exam countdowns, Plan my day, tip of the day, parking lot, due reviews.
- **Focus timer**: Pomodoro, Deep work, Custom and Stopwatch modes. Also a parking lot, a tab-switch check, an end-of-session check-in, and a timer that survives a refresh.
- **Toppy the owl**: study and break nudges, 20-20-20 eye reminders, a late-night guard, celebrations, 3 personalities, unlockable outfits, and browser notifications.
- **Sound**: calm focus music: sleep-style pads and soft fingerpicked guitar generated live (no files, endless), plus four quiet public-domain piano recordings (credits in `public/music/CREDITS.md`), all levelled to the same calm volume; a rain, café, brown noise, fireplace, ocean and library-hum mixer; a music bar on every screen with one-tap stop; lock-screen controls; music gets quieter on breaks.
- **Planning**: SMART goal builder with live S/M/A/R/T checks against your real history, goal reviews, weekly drag-and-drop board, tasks with carry-over, term calendar, exam prep planner, spaced review (1/3/7/14 days), grade tracker with a percentage → letter scale with a "what do I need on the final" calculator.
- **Break-only games**: breathing bubble, memory match, 2048, reaction tap, doodle pad with gallery, word scramble, stretch cards, flashcards.
- **Motivation**: XP and levels, ranks (Tuning In → Locked In → Dialed In → In the Zone → Unstoppable → GOAT), badges, unlockable themes, outfits and sounds, a study garden.
- **Stats**: week chart, course split, year heatmap, best focus time, course balance warning, a shareable weekly recap image, session log.
- **Course tools**: markdown notes; flashcards with pictures (paste, drop or take a photo, shrunk on the device to about 100–200 KB) and formulas (`$…$`, rendered with KaTeX); links; exam-day checklist.
- **Your data**: backup and restore (JSON), CSV export, delete everything. Installable as an app and works offline.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs to dist/
npm run preview   # serve the production build
npm run icons     # regenerate PNG icons from public/icon.svg
```

## Deploy

Pushing to `main` on GitHub runs `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages. Turn it on once in the repo under **Settings → Pages → Source: GitHub Actions**.

The build is a plain static site, so `dist/` also works on Netlify, Cloudflare Pages, or any other static host.

## Visitor counts (optional)

Dialed In can count users anonymously with [GoatCounter](https://www.goatcounter.com). It's free for non-commercial use, sets no cookies and collects no personal data.

What gets counted:
- each time someone opens Dialed In (`/app`, or `/app-installed` for the installed app)
- `new-user`, when someone finishes setup
- `focus-session`, when someone saves a session

Nothing a student types is ever sent. Students can opt out in **Me → Privacy**, and Do Not Track is respected.

To turn it on:
1. Sign up at goatcounter.com and pick a site code (e.g. `ontop` → `ontop.goatcounter.com`).
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions → Variables** and add `GOATCOUNTER_CODE` with your code.
3. Push. The deploy build picks it up. Without the variable, counting is completely off.

## Sync between devices (optional)

Students can turn on sync in **Me → Sync between devices**. They get a 16-character code and a QR code, and typing or scanning it on another device joins the same sync group.

- **End-to-end encrypted.** The code never leaves the device. From it, the app derives a lookup id and an AES-256 key (PBKDF2, 200k rounds). Data is gzipped and encrypted on the device, so the server only ever stores ciphertext.
- **Merging** (`src/lib/sync-merge.js`): a three-way merge against the last agreed state. Additions from both devices are kept, an edit beats a deletion, settings merge field by field, and XP is recomputed from sessions. Tests: `npm test`.
- **Server:** `worker/`, a Cloudflare Worker plus a D1 database at `https://sync.imdialedin.app`, with endpoints for the data (GET / PUT with version check / DELETE) and for flashcard pictures (`/v1/img/…`, encrypted the same way, max 600 per group). Break-art doodles and device-only settings don't sync.

To deploy the server:
```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create dialedin-sync   # paste the database_id into wrangler.toml
npm run db:remote                      # creates the table
npm run deploy                         # publishes to sync.imdialedin.app
```
To run it locally: `npm run db:local && npm run dev`, then build the app with `VITE_SYNC_URL=http://localhost:8787`.
