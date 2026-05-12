# Ping Pong Ladder v2

A fully static, GitHub Pages-ready ping pong ladder app.

## What changed from v1

The old implementation used multiple HTML pages plus a Google Apps Script / Google Sheets backend. v2 is a single-page app that runs from GitHub Pages and keeps the tournament rules in `app.js`.

## Features

- Current ladder dashboard
- Legal challenge matrix
- Match submission with validation
- Automatic ladder movement
- Player roster management
- Season reset
- Match history
- Live awards
- Inactivity movement button
- JSON export/import
- Optional GitHub sync to `data/state.json`

## Rules implemented

- Players can challenge up to 2 ranks above.
- Players can challenge 1 rank below as a push-down challenge.
- Back-to-back repeat opponents are blocked by default.
- Best of 3 final score is recorded as 2-0, 2-1, 0-2, or 1-2.
- If a challenger beats a higher-ranked defender, they swap.
- If the defender wins an upward challenge, no ladder movement occurs.
- If a higher-ranked challenger wins a push-down challenge, the defender drops one rank.
- If the lower-ranked defender wins a push-down challenge, the players swap.
- Inactivity can be applied manually from the dashboard.

## Deploy to GitHub Pages

1. Create a new GitHub repository.
2. Copy these files into the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `data/seed.json`
   - `README.md`
3. Commit and push.
4. In GitHub, go to **Settings > Pages**.
5. Set source to **Deploy from a branch**.
6. Select `main` and `/root`.
7. Open the Pages URL after it deploys.

## Shared data options

### Simple mode

Use the app in one browser and export JSON backups from **Settings**.

### Team mode with GitHub sync

The app can commit the full state to `data/state.json` using the GitHub Contents API. Each admin stores their own fine-grained GitHub token locally in their browser.

Recommended token permissions:

- Repository: the ladder repo only
- Contents: read/write

Do not hard-code or commit a token.

## Changing the starting roster

Use **Players > Paste new season roster** in the app, or edit `data/seed.json` before deployment.

## Local testing

Open `index.html` directly in a browser, or run a simple local static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
