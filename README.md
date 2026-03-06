# 1540 Schedule

Build a schedule from form responses, then publish it as a **static website** on GitHub Pages (no server on the live site).

## Setup

1. Put form responses in **responses.csv** (or set `csvPath` in **config.js**).
2. Edit **config.js**: `competitionStartTime`, `competitionEndTime`, `blockDurationMinutes`, `numberOfDays`, `columnMap` (must match your CSV headers).
3. Edit **requirements.js**: min/max per role (Drive, Pits, Journalist, Strategy, Media, etc.). Number per block or array per block.

## Build (schedule + CSV + static site)

```bash
npm install
npm run build
```

This:

- Runs the scheduler and writes **data.json**
- Writes **schedule.csv** (Day, Name, then one column per time block)
- Writes the static site into **docs/** (schedule.json + index.html, schedule.js, styles.css)

## Publish to GitHub

1. Commit and push the repo (including the **docs/** folder).
2. On GitHub: **Settings → Pages → Source**: Deploy from branch → **main** → **/docs**.
3. The schedule is live at `https://<your-username>.github.io/1540.Schedule/` (or your repo path). No server; it’s all static.

## Optional: run locally with a server

```bash
npm start
```

Open http://localhost:3000. After changing config or CSV, hit http://localhost:3000/api/regenerate to rebuild.

Fake data: `node tester.js` or `node tester.js 50`.
