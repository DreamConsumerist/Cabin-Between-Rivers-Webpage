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

## Phase 3 — Booking core (test locally)

With `netlify dev` running in one terminal, do the following in a second terminal.

1. **Apply the new overlap-constraint migration** to the local DB:
   ```bash
   netlify database migrations apply
   ```
   > This applies `..._booking_overlap_constraint` — a range-only daterange EXCLUDE constraint
   > (uses Postgres's built-in GiST range operators; no extension required).

2. **Seed the settings row** (prices are in CENTS; e.g. $150.00/night, $75.00 cleaning, 2-night min):
   ```bash
   netlify database connect --query "INSERT INTO settings (nightly_rate, cleaning_fee, min_nights) VALUES (15000, 7500, 2)"
   ```

3. **Test availability** (should return `{ "blocked": [] }` initially):
   ```powershell
   Invoke-RestMethod http://localhost:8888/api/check-availability
   ```

4. **Create a booking** (PowerShell-friendly):
   ```powershell
   $body = @{ checkIn="2026-09-01"; checkOut="2026-09-04"; guestName="Test Guest"; guestEmail="test@example.com"; guests=2 } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri http://localhost:8888/api/create-booking -ContentType "application/json" -Body $body
   ```
   Expect a `reservationId`, `amountTotal` (52500 = 3 × 15000 + 7500), and `holdExpiresAt`.

5. **Prove double-booking is blocked** — run the same command again (overlapping dates). Expect an
   HTTP 409 "Those dates were just taken" (the EXCLUDE constraint rejecting the overlap). Re-running
   `check-availability` should now show your first booking as a blocked range.

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

Phases 1–3 are code-complete. Skeleton + database + booking core (availability, create-booking with
overlap-proof holds, expire-holds cron) are done and type-checked. Verify Phase 3 locally with the
steps above. Next up: **Phase 4 — Stripe** (charge the held reservation; confirm via webhook).
