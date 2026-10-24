# NexusHub ERP — Deploy checklist (Phase 3 / 8)

Local API + MySQL are verified (`/api/health`, login, analytics, overlap → 409).  
Public GitHub: https://github.com/ashutosh-dave/nexushub-erp  
Frontend live: https://nexushub-erp.vercel.app (SSO protection disabled).  
**Railway abandoned** (unreliable). Use **Aiven free MySQL** + **Render** for API.

## 1. Public GitHub repo

```bash
gh auth login
cd "D:\NexusHub ERP"
gh repo create nexushub-erp --public --source=. --remote=origin --push
```

## 2. Hosted MySQL (Aiven free or Railway MySQL)

1. Create a MySQL 8 instance.
2. Note host, port, user, password, database name.
3. From this machine (with `backend/.env` pointed at the **hosted** DB):

```bash
cd backend
# set DB_* and DB_SSL=true in .env
npm run db:migrate
npm run db:seed
```

## 3. Render (API)

1. New **Web Service** from the GitHub repo.
2. Root directory: `backend`
3. **Build Command:** `npm ci --omit=dev` (installs production deps; do **not** use a no-op `npm run build` alone — that skips `node_modules` and causes `Cannot find package 'express'`). If Render only runs `npm run build`, that script itself runs `npm ci --omit=dev`.
4. **Start Command:** `node src/server.js`
5. Health check: `/api/health`
6. Env vars (from `backend/.env.example` / local `backend/.env`):

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | from MySQL host |
| `DB_SSL` | `true` |
| `JWT_SECRET` | strong random string |
| `JWT_EXPIRES_IN` | `8h` |
| `CORS_ORIGIN` | your Vercel URL (set after step 4; can update) |

Optional: use root `render.yaml` as a blueprint.

## 4. Vercel (frontend)

**Done (CLI):** project `nexushub-erp` under Ashutosh's projects, linked to `https://github.com/ashutosh-dave/nexushub-erp`, root directory `frontend`, framework Vite, output `dist`. Production URL: https://nexushub-erp.vercel.app. Deployment Protection / SSO is off (public).

```bash
# From monorepo root (Root Directory is already `frontend` on the Vercel project)
cd "D:\NexusHub ERP"
npx vercel login   # if needed
npx vercel --prod
```

Env (set in Vercel for Production, Preview, Development):

| Key | Value |
|-----|--------|
| `VITE_API_BASE_URL` | **Placeholder until Render is live:** `https://REPLACE_WITH_RENDER_API.onrender.com/api` — replace with the real Render URL (e.g. `https://nexushub-api.onrender.com/api`) then redeploy the frontend |

SPA rewrite is already in `frontend/vercel.json`.

## 5. Finish CORS loop

Set Render `CORS_ORIGIN` to the final Vercel URL and redeploy the API if needed.

## 6. Smoke test live

- `GET https://<api>/api/health` → 200
- Login `admin@nexushub.test` / `Password@123` on the Vercel site
- Update README “Live URLs” section with the two URLs

## Local MySQL note (dev only)

This machine uses a user-scoped MySQL data dir:

- Config: `%USERPROFILE%\nexushub-mysql\my.ini`
- Start: `"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --defaults-file=%USERPROFILE%\nexushub-mysql\my.ini`
