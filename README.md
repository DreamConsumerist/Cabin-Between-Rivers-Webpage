# Cabin Between Rivers

Reservation website for a single Airbnb listing, hosted on Netlify.

## What's here

- **Booking** — a 3-step wizard (calendar → guest details → embedded Stripe checkout) with
  server-enforced holds and a DB-level overlap constraint that makes double-booking impossible.
- **Payments** — Stripe embedded Checkout, confirmed via a signature-verified, idempotent webhook
  (never the browser redirect).
- **Admin panel** (`/admin`, password-gated) — manage the About-page photo gallery (upload, caption,
  reorder, delete) and pricing/min-nights settings without a redeploy.
- **Database** — Postgres (Netlify DB / Neon) via Drizzle ORM, migrated with Drizzle Kit and
  Netlify's migration tracker.

Not yet built: iCal import/export sync with Airbnb and Vrbo (the one remaining phase from the
original plan — see `SETUP.md`).

## Stack

- **Vite + React 19 + TypeScript**
- **TanStack Router** — file-based routing (`src/routes/`)
- **TanStack Query** — server-state / data fetching (shared `QueryClient` in `src/queryClient.ts`)
- **Netlify Functions** (`netlify/functions/`) — the API, deployed alongside the frontend
- **Postgres + Drizzle ORM** (`db/`) — schema and migrations
- **Stripe** — embedded Checkout + webhook
- **Netlify Blobs** — gallery photo storage
- **Tailwind CSS 4**
- **react-hook-form + zod** — forms and validation
- **dayjs** — date handling
- **Vitest + Playwright** — unit and e2e testing

## Getting started

See `SETUP.md` for the full first-time setup (Netlify account, database, Stripe keys, admin
credentials). Once set up:

```bash
pnpm install
pnpm run setup   # installs Playwright browsers
netlify dev       # serves the app + functions on http://localhost:8888
```

## Scripts

| Script | Purpose |
| --- | --- |
| `dev` | Start the Vite dev server (frontend only — use `netlify dev` for functions + DB) |
| `build` | Type-check and build for production |
| `preview` | Preview the production build |
| `typecheck:server` | Type-check the Netlify Functions (`tsconfig.server.json`) |
| `lint` / `lint:fix` | ESLint |
| `format` | Prettier |
| `test` | Unit (Vitest) + e2e (Playwright) |
| `test:unit` / `test:unit:coverage` | Vitest only |
| `test:e2e` / `test:e2e:report` | Playwright only |
| `db:generate` | Generate a Drizzle migration from `db/schema.ts` changes |
| `db:studio` | Browse the database in Drizzle Studio |

## Project structure

```
db/               Drizzle schema (db/schema.ts) and DB client
lib/              Server-side logic shared by functions (availability, booking, gallery,
                  Stripe, admin auth, HTTP helpers)
netlify/
  functions/      API endpoints (booking, payments, admin, gallery, cron)
  database/       Generated Drizzle migrations
public/           Static files served as-is (e.g. terms.html)
src/
  common/         Shared types and utilities
  components/     ui / forms / layout components
  features/       Feature modules (booking, admin, gallery) — API clients + React Query hooks
  pages/          Page components
  routes/         TanStack Router route definitions
  styles/         Tailwind entry
e2e/              Playwright tests
```
