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
  processed_webhook_events), `db/client.ts` (Drizzle `netlify-db` adapter), `drizzle.config.ts`.
- ✅ Packages: `@netlify/database` + `drizzle-orm@beta` + `drizzle-kit@beta` (the beta channel is
  what ships the `drizzle-orm/netlify-db` adapter Netlify's docs recommend).
- ✅ First migration generated (timestamp-prefixed): `netlify/database/migrations/<ts>_*/migration.sql`.
- ✅ Scripts: `pnpm db:generate` (create migrations), `pnpm db:studio` (inspect data).

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

## Phase 2 — Database

There are two databases: a **local** one (for development, started by `netlify dev`) and the
**cloud** one (auto-provisioned on your first deploy, because `@netlify/database` is a dependency).

### Develop locally (no deploy, no credits)

1. Start the dev environment (leave running):
   ```bash
   netlify dev
   ```
2. In a second terminal, apply the migration to the local database:
   ```bash
   netlify database migrations apply
   ```
3. Verify / inspect:
   ```bash
   netlify db status                                # should show the migration as applied
   netlify dev:exec -- pnpm db:studio               # browse tables/data
   ```

### Migration workflow (going forward)

You do **not** run `drizzle-kit migrate` (that would fight Netlify's migration tracker). Instead:
```bash
pnpm db:generate                    # after editing db/schema.ts -> new timestamped migration
netlify database migrations apply   # apply to the local DB
```
Netlify applies pending migrations to the **cloud** DB automatically on deploy.

### Provision + claim the cloud database  *(at first deploy)*

The cloud DB doesn't exist until you deploy. When you're ready:
1. `netlify deploy --build --prod` — Netlify provisions the cloud Postgres and applies migrations.
2. **Claim it into a free Neon account** (our decision — keeps it permanently $0 and off Netlify's
   credit pool): dashboard → Database panel → **Connect Neon** / **Claim database**.

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
