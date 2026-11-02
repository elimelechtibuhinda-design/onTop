# onTop 🦉

A study tracker for students: plan with SMART goals, focus with a timer, take real breaks.
No sign-in. Everything is stored in the browser on your own device.

Made with 💙💛 for students everywhere.

## What's inside

- **Today**: one-tap Start, daily goal ring, streak with a weekly freeze, exam countdowns, Plan my day, tip of the day, parking lot, due reviews.
- **Focus timer**: Pomodoro, Deep work, Custom and Stopwatch modes. Also a parking lot, a tab-switch check, an end-of-session check-in, and a timer that survives a refresh.
- **Toppy the owl**: study and break nudges, 20-20-20 eye reminders, a late-night guard, celebrations, 3 personalities, unlockable outfits, and browser notifications.
- **Sound**: focus-music playlists of real recordings: piano (Satie, Chopin, Schumann) and acoustic guitar (Sor, Tárrega, Bach), with credits in `public/music/CREDITS.md`; a rain, café, brown noise, fireplace, ocean and library-hum mixer; a music bar on every screen with one-tap stop; lock-screen controls; music gets quieter on breaks.
- **Planning**: SMART goal builder with live S/M/A/R/T checks against your real history, goal reviews, weekly drag-and-drop board, tasks with carry-over, term calendar, exam prep planner, spaced review (1/3/7/14 days), grade tracker with a percentage → letter scale with a "what do I need on the final" calculator.
- **Break-only games**: breathing bubble, memory match, 2048, reaction tap, doodle pad with gallery, word scramble, stretch cards, flashcards.
- **Motivation**: XP and levels, ranks (Freshman → Legend), badges, unlockable themes, outfits and sounds, a study garden.
- **Stats**: week chart, course split, year heatmap, best focus time, course balance warning, a shareable weekly recap image, session log.
- **Course tools**: markdown notes, flashcards, links, exam-day checklist.
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
