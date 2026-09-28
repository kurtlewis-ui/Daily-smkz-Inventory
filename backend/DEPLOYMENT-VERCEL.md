# Deploying the backend to Vercel (Vercel + Supabase, no Render)

This backend (NestJS) can run on **Vercel serverless functions** instead of an
always-on server like Render. The database stays on **Supabase**. This suits a
24/7 shop: Vercel functions spin up per request, so there is **no "sleep"** to
work around and **no UptimeRobot needed** (pinging a Vercel function only wastes
your free quota — don't do it).

> Why this works for *this* app: it has **no WebSockets** and **no Redis**, so it
> is fully stateless between requests — exactly what serverless needs.

---

## Architecture after this change

```
Custom domain (Hostinger DNS)
        │
        ├── Frontend (Next.js)   → Vercel project #1   (unchanged)
        │
        └── Backend  (NestJS)    → Vercel project #2   (this folder: /backend)
                                        │
                                        └── PostgreSQL → Supabase
                                        └── Images     → Cloudinary
```

You will have **two Vercel projects** from the same GitHub repo:

| Vercel project | Root Directory | What it serves |
| -------------- | -------------- | -------------- |
| Frontend       | `frontend`     | The web app |
| Backend (API)  | `backend`      | The REST API (this guide) |

---

## How it works (what changed in the code)

- `src/create-app.ts` — shared NestJS setup (CORS, helmet, cookies, validation,
  filters, interceptors, Swagger). Used by both entry points so they behave
  identically.
- `src/main.ts` — the traditional always-on server (local dev / Docker /
  Render). Still runs migrations on boot. **Vercel does not use this file.**
- `api/index.ts` — the **Vercel serverless handler**. Boots Nest once per warm
  instance, caches it, and hands each request to Express. It does **not** run
  migrations.
- `vercel.json` — build command + routing (all paths → the function).
- Migrations run in the **Vercel build step** (`npm run vercel-build` →
  `prisma migrate deploy` with retry + seed), not at runtime.
- `prisma/schema.prisma` — added `binaryTargets` so the Prisma engine works on
  Vercel's Linux runtime.

---

## Step 1 — Get your Supabase connection strings

In the Supabase dashboard → **Project Settings → Database → Connection string**,
grab two URLs (use your project's region):

1. **Transaction pooler** (port **6543**) — for the running app. Append
   `?pgbouncer=true`:
   ```
   postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
2. **Session pooler / direct** (port **5432**) — for migrations only:
   ```
   postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres
   ```

> The transaction pooler (6543) can't run Prisma migrations (no advisory locks /
> session DDL), which is why migrations use the 5432 URL.

---

## Step 2 — Create the backend Vercel project

1. On [vercel.com](https://vercel.com) → **Add New… → Project** → import your
   GitHub repo (`kurtlewis-ui/Daily-smkz-Inventory`).
2. **Root Directory:** set to `backend`.
3. **Framework Preset:** **Other** (Vercel will read `vercel.json`).
4. Leave build/output settings as-is — `vercel.json` supplies the build command.

---

## Step 3 — Set the backend environment variables

In the backend Vercel project → **Settings → Environment Variables**, add these
for **Production** (and Preview if you want preview deploys to work):

| Variable | Value / notes |
| -------- | ------------- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase **6543** transaction-pooler URL (with `?pgbouncer=true`) |
| `MIGRATE_DATABASE_URL` | Supabase **5432** session/direct URL (migrations only) |
| `CORS_ORIGIN` | Your frontend's exact origin, e.g. `https://dailysmokzvs.com` (scheme + host, **no trailing slash**) |
| `JWT_SECRET` | A strong random string (min 32 chars) |
| `JWT_REFRESH_SECRET` | A different strong random string (min 32 chars) |
| `JWT_EXPIRATION` | `60m` |
| `JWT_REFRESH_EXPIRATION` | `7d` |
| `BCRYPT_ROUNDS` | `12` |
| `SESSION_TIMEOUT` | `28800` |
| `RATE_LIMIT_TTL` | `60` |
| `RATE_LIMIT_MAX` | `100` |
| `API_PREFIX` | `api/v1` |
| `COOKIE_SAMESITE` | `none` (frontend & API are on different domains) |
| `COOKIE_SECURE` | `true` |
| `CLOUDINARY_CLOUD_NAME` | (optional) from Cloudinary |
| `CLOUDINARY_API_KEY` | (optional) from Cloudinary |
| `CLOUDINARY_API_SECRET` | (optional) from Cloudinary |

> To generate a secret quickly: `openssl rand -base64 48`
>
> Reuse the **same** `JWT_SECRET` / `JWT_REFRESH_SECRET` you used on Render if you
> want existing logged-in sessions/tokens to keep working. Otherwise everyone
> just logs in again.

---

## Step 4 — Deploy

Click **Deploy**. The build runs `npm run vercel-build`, which:

1. `prisma generate` — builds the client (with the Linux engine),
2. `node scripts/migrate-with-retry.js` — applies migrations against
   `MIGRATE_DATABASE_URL` (retries a cold DB),
3. seeds the bootstrap admin/roles (non-fatal if it fails).

When it finishes you'll get a URL like `https://your-backend.vercel.app`.

**Smoke-test it:**
```bash
curl https://your-backend.vercel.app/health
# expect JSON with "status": ... (health/version are exempt from the /api/v1 prefix)
```

The API itself lives under the prefix, e.g.
`https://your-backend.vercel.app/api/v1/...`.

---

## Step 5 — Point the frontend at the new backend

In the **frontend** Vercel project → **Settings → Environment Variables**, set:

```
NEXT_PUBLIC_API_URL = https://your-backend.vercel.app/api/v1
```

Then **redeploy the frontend** (env changes only take effect on a new build).

> The frontend appends `/api/v1` automatically if you omit it, but setting it
> explicitly is clearest.

Also make sure the backend's `CORS_ORIGIN` matches the frontend's real origin
(your custom domain), or the browser will block requests.

---

## Step 6 — (Optional) custom domain for the API

You can leave the API on `*.vercel.app`, or add a subdomain like
`api.dailysmokzvs.com` to the backend Vercel project (Vercel shows the DNS
record to add in Hostinger). If you do, update `NEXT_PUBLIC_API_URL` to match.

---

## Notes, limits & gotchas

- **No UptimeRobot.** Serverless has nothing to keep awake; pinging it only
  consumes your free invocations/bandwidth.
- **Cold starts.** The first request to a cold instance is a bit slower while
  Nest boots; warm requests are fast. Normal for serverless.
- **Function timeout.** Set to 30s in `vercel.json` (`maxDuration`). The Hobby
  plan caps this lower on some accounts; if long reports time out, either
  optimize the query or upgrade the Vercel plan.
- **Migrations run at build time.** If you add a migration, it's applied on the
  next deploy. To deploy code **without** running migrations, you can run
  `prisma migrate deploy` yourself and simplify the build command.
- **Render is no longer needed.** You can suspend/delete the Render services.
  `render.yaml` is kept in the repo only for reference/fallback.
- **One database, one source of truth.** Both the (old) Render and (new) Vercel
  backends point at the **same** Supabase DB, so data is never split.

---

## Rollback

If anything misbehaves, the old Render setup is untouched in code
(`src/main.ts` + `render.yaml`). Re-point the frontend's `NEXT_PUBLIC_API_URL`
back to the Render URL and redeploy the frontend.
