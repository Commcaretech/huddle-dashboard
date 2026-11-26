# Getting started

1. Install Node.js 24 LTS and clone the repository.
2. Run `npm ci` and `npm run dev`. Use `npm.cmd` in Windows PowerShell.
3. Open http://127.0.0.1:5173. Express listens on port 3001.
4. Explore the synthetic demo. It seeds the fortnight current on first launch and the previous one. Use Settings → Periods to add other dates.
5. Run `npm test` and `npm run build`. To test the built app, run `npm start` and open http://127.0.0.1:3001.

Configuration comes from the environment or an optional local copy of `.env.example` named `.env`. Keep credentials outside version control. Use port 3001 for the development proxy or update the Vite proxy target along with the local port.

Demo edits persist in `data/demo-postgres/`. To keep a separate temporary development database, set `HUB_DEMO_MEMORY=true` for that process. Stop the local server before copying the demo directory for backup. Never use a synthetic environment for live data.

The prior local dashboard's SQLite file was `data/huddle.sqlite`. Preserve a copy if available. The new server neither reads nor alters it. The prior implementation remains available in Git. Its data import and export paths require that version or a future approved conversion workflow.
