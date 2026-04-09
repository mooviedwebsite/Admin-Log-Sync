# MOOVIED — Full Stack Source Code

Netflix-style movie streaming and TV series website.

- **Frontend**: React + Vite + Tailwind CSS (black/yellow, glassmorphism)
- **Backend**: Express.js + PostgreSQL (comments & movie meta)
- **Data Source**: Google Sheets via Google Apps Script (movies, users, watch history)

---

## Project Structure

```
moovied-workspace/
├── moovied/            # Frontend — React + Vite (deployed to GitHub Pages)
│   ├── src/
│   ├── public/
│   ├── code.gs         # Google Apps Script backend code
│   └── build-gh-pages.mjs
├── api-server/         # Backend — Express.js REST API
│   └── src/
│       ├── routes/     # comments, movie-meta, health
│       └── lib/
├── lib/
│   ├── db/             # PostgreSQL schema (Drizzle ORM)
│   └── api-zod/        # Shared API types
├── package.json
└── pnpm-workspace.yaml
```

---

## Requirements

- Node.js 20+
- pnpm 9+
- PostgreSQL database
- Google account (for Google Sheets + Apps Script)

---

## Step 1 — Install dependencies

```bash
npm install -g pnpm
pnpm install
```

---

## Step 2 — Google Sheets Setup (Movie Database)

All movies, users, and TV series are stored in Google Sheets.

1. Open the Google Sheet:
   [https://docs.google.com/spreadsheets/d/14Flm-LOjocdd6vBLm5Z3c5GeIW5_W_7mVNikUSubIiI](https://docs.google.com/spreadsheets/d/14Flm-LOjocdd6vBLm5Z3c5GeIW5_W_7mVNikUSubIiI)

2. Go to **Extensions → Apps Script**

3. Delete all existing code and paste the full contents of `moovied/code.gs`

4. Click **Run** → Select function `setupSheets` → Run it once (creates Movies, Users, Comments sheets)

5. Click **Deploy → New Deployment**
   - Type: Web App
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy and copy the Web App URL

6. Open the MOOVIED website → Admin → Settings → paste the Web App URL → Save → Test Connection

---

## Step 3 — PostgreSQL Setup (Comments & Movie Meta)

Comments and extended movie details are stored in PostgreSQL.

```bash
# Set your PostgreSQL connection string
export DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Push the database schema
cd lib/db
pnpm run push
```

---

## Step 4 — Run the backend API server

```bash
export DATABASE_URL="postgresql://user:password@host:5432/dbname"
export PORT=3000

pnpm --filter @workspace/api-server run dev
```

The API will be available at `http://localhost:3000/api`

In Admin → Settings → Comments API Base URL, set it to your server URL.

---

## Step 5 — Run the frontend (development)

```bash
pnpm --filter @workspace/moovied run dev
```

The site will be available at `http://localhost:5173`

---

## Step 6 — Build for GitHub Pages (static hosting)

```bash
cd moovied
node build-gh-pages.mjs
```

This outputs to `moovied/dist/gh-pages/`. Upload the contents to your GitHub Pages repository.

---

## Admin Login

- Email: `rawindunethsara93@gmail.com`
- Password: `Rnd@12114`

To change admin credentials, edit `moovied/src/lib/auth.ts`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes (API server) | PostgreSQL connection string |
| `PORT` | Yes (API server) | Port for the API server |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Wouter, TanStack Query |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| Movie Data | Google Sheets + Google Apps Script |
| Deployment | GitHub Pages (frontend), any Node.js host (backend) |

---

## Deploying the Backend

The backend can be deployed to any platform that supports Node.js:

- **Railway**: Add `DATABASE_URL` env var, set start command to `node dist/index.mjs`
- **Render**: Connect repo, set `DATABASE_URL`, build command `pnpm --filter @workspace/api-server run build`
- **Fly.io**: Use the `api-server/` folder, add `DATABASE_URL` secret
- **VPS**: Clone repo, install pnpm, `pnpm install`, build, run with PM2

After deploying, update the Comments API URL in Admin → Settings.
