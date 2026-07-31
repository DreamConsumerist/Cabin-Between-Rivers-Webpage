# Cabin Between Rivers

**Live site: [cabinbetweenrivers.com](https://cabinbetweenrivers.com)**

Reservation website for a single Airbnb listing, hosted on Netlify.

## What's here

- **Booking** — a wizard (optional configuration picker → calendar → guest details → terms & ID
  upload → embedded Stripe checkout) with server-enforced holds and a DB-level overlap constraint
  that makes double-booking impossible. A guest can enter a discount code at the payment step to
  reprice the total before paying.
- **Bookable configurations** — the one physical cabin can be listed as multiple bookable options
  (e.g. "Whole Cabin" vs. "Downstairs Only"), each with its own nightly rate, cleaning fee, and
  seasonal (date-range) pricing overrides. Availability blocking is shared across configurations
  (booking either occupies the same property), but pricing isn't.
- **Discount codes** — admin-managed percent or flat-cents codes a guest applies at checkout; the
  charge is repriced server-side, never trusted from the client.
- **Payments** — Stripe embedded Checkout, confirmed via a signature-verified, idempotent webhook
  (never the browser redirect).
- **Guest email** — booking confirmation, cancellation confirmation, and scheduled check-in/
  check-out reminders, all sent via Resend. The admin is separately alerted on a new booking, a
  guest self-cancellation, and any double-booking conflict.
- **iCal sync** — imports Airbnb/Vrbo `.ics` blocks so site availability reflects bookings made
  elsewhere, and exports the site's own reservations as a token-gated `.ics` feed for Airbnb/Vrbo to
  import back, closing the loop in both directions. Runs on save, on demand, and hourly via a
  scheduled function. If the two sides still disagree (e.g. an external block overlapping an active
  reservation, or a payment confirming into dates rebooked in the meantime), it's logged as a
  double-booking conflict and emailed to the admin.
- **Admin panel** (`/admin`, password-gated) — manage bookings (guest info, cancel/refund, uploaded
  photo ID, a month-at-a-glance calendar), resolve flagged double-booking conflicts, the About-page
  photo gallery (upload, caption, reorder, delete — photos are resized server-side before storage),
  bookable configurations with seasonal pricing and discount codes, iCal settings, guest-email
  content/schedule and internal notification recipients, and the Terms & Conditions text — all
  without a redeploy.
- **Database** — Postgres (Netlify DB / Neon) via Drizzle ORM, migrated with Drizzle Kit and
  Netlify's migration tracker.

See `SETUP.md`'s "Known issues / TODO" for open items (rate limiting, refund tiers, SEO submission,
discount code expiry/usage limits, and more).

## Stack

- **Vite + React 19 + TypeScript**
- **TanStack Router** — file-based routing (`src/routes/`)
- **TanStack Query** — server-state / data fetching (shared `QueryClient` in `src/queryClient.ts`)
- **Netlify Functions** (`netlify/functions/`) — the API, deployed alongside the frontend
- **Postgres + Drizzle ORM** (`db/`) — schema and migrations
- **Stripe** — embedded Checkout + webhook
- **Netlify Blobs** — gallery photo storage
- **sharp** — resizes gallery photo uploads server-side before storage
- **Resend** — transactional/guest email
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
| `db:local` | Run a real local Postgres for `netlify dev` (see `scripts/local-db.mjs`) |

## Project structure

```
db/               Drizzle schema (db/schema.ts) and DB client
lib/              Server-side logic shared by functions (availability, booking, discount
                  codes, gallery, Stripe, admin auth, iCal sync/export, double-booking
                  conflicts, email via Resend, HTTP helpers)
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
