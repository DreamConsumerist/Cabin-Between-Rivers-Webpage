# Setup & owner checklist

This tracks the setup steps that need **your accounts and credentials** (I can't do these
for you), alongside what's already wired in the repo. Work top to bottom.

Reference: the full technical plan lives at
`~/.claude/plans/we-ll-discuss-the-minutiae-scalable-pearl.md`.

---

## Already done (in the repo)

- ✅ Cleansed React/Vite/TS app, builds and lints clean (`pnpm build`, `pnpm lint`).
- ✅ `netlify.toml` — build, functions dir, `netlify dev` config, `/api/*` → functions redirect.
- ✅ `netlify/functions/health.mts` — a health-check endpoint (`/api/health`).
- ✅ Database code scaffolded: `db/schema.ts` (reservations, external_blocks, settings,
  processed_webhook_events), `db/client.ts` (Drizzle + `@netlify/neon`), `drizzle.config.ts`.
- ✅ First migration generated: `netlify/database/migrations/0000_*.sql`.
- ✅ Scripts: `pnpm db:generate | db:migrate | db:push | db:studio`.

---

## Phase 0 — Netlify account + CLI  *(you)*

1. Create a free account at https://app.netlify.com (the **Starter/Free** plan is fine — see the
   cost notes in the plan; watch deploy frequency).
2. Install the CLI and log in:
   ```bash
   npm install -g netlify-cli
   netlify login
   ```
3. From this project folder, connect the repo to a Netlify project:
   ```bash
   netlify init      # create a new Netlify project for this repo
   # (or: netlify link   if you already created one in the dashboard)
   ```

## Verify the skeleton locally

```bash
pnpm install         # if you haven't already
netlify dev          # serves the app + functions on http://localhost:8888
```
Then open `http://localhost:8888/api/health` — you should see
`{ "ok": true, "service": "cabin-between-rivers", ... }`.

## Phase 2 — Provision the database + claim it to Neon Free  *(you)*

1. Provision the Netlify-managed Postgres:
   ```bash
   netlify db init
   ```
   This injects `NETLIFY_DATABASE_URL` (and an unpooled variant) into the project.
2. **Claim it into a free Neon account immediately** (this is the decision we made — it keeps the
   database permanently $0 and off Netlify's credit pool): in the Netlify dashboard open the
   database/extension panel and choose **Connect Neon** / **Claim database**, creating a free
   Neon login when prompted. Confirm the exact **unpooled** env-var name shown in your project's
   Environment variables panel (it should be `NETLIFY_DATABASE_URL_UNPOOLED`).
3. Apply the migration (run through the CLI so the DB env vars are injected):
   ```bash
   netlify dev:exec -- pnpm db:migrate
   ```
   Optionally inspect data with `netlify dev:exec -- pnpm db:studio`.

## First production deploy

```bash
netlify deploy --build --prod
```
Confirm the live site loads and `https://<your-site>/api/health` responds.
> Reminder: production deploys cost ~15 Netlify credits each (~20/month on Free). Deploy
> deliberately, not on every commit.

---

## Later phases (secrets you'll add when we build them)

Set these in the Netlify UI (Project → Environment variables) or via
`netlify env:set NAME value` with the **Functions** scope. **Never commit secrets** — keep them
out of `netlify.toml` and any tracked `.env`.

- **Stripe (Phase 4):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  and `VITE_STRIPE_PUBLISHABLE_KEY` (the `VITE_` one is public/browser-safe).
  Local webhook testing: `stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook`.
- **iCal (Phase 5):** your Airbnb and Vrbo calendar export URLs (stored in the `settings` table,
  not env vars), and you'll paste our exported `/calendar.ics` URL into Airbnb + Vrbo.

---

## Where we are

Phases 1–2 (the skeleton) are code-complete pending your account steps above. Next up when you're
ready: **Phase 3 — availability + booking core** (the `check-availability`, `create-booking`, and
`expire-holds` functions, plus the Postgres overlap-prevention constraint).
