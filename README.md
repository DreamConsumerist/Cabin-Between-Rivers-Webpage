# Cabin Between Rivers

Reservation website for a single Airbnb listing, hosted on Netlify.

## Goals

1. **Book a reservation** directly on the site.
2. **iCal sync** with Airbnb and Vrbo to prevent double-booking (import their `.ics`
   feeds, export our own).
3. **Process payments** through Stripe.
4. **Store data** in a database provisioned within the same Netlify deployment
   (Neon Postgres via `netlify db`, accessed with Drizzle ORM).

## Stack

- **Vite + React 19 + TypeScript**
- **TanStack Router** — file-based routing (`src/routes/`)
- **TanStack Query** — server-state / data fetching
- **Tailwind CSS 4**
- **react-hook-form + zod** — forms and validation
- **zustand** — client state
- **dayjs** — date handling
- **Vitest + Playwright** — unit and e2e testing

## Getting started

```bash
pnpm install
pnpm run setup   # installs Playwright browsers
pnpm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `dev` | Start the Vite dev server |
| `build` | Type-check and build for production |
| `preview` | Preview the production build |
| `lint` / `lint:fix` | ESLint |
| `format` | Prettier |
| `test` | Unit (Vitest) + e2e (Playwright) |

## Project structure

```
src/
  common/       shared types and utilities
  components/   ui / forms / layout components
  features/     feature modules (booking, payments, ...)
  hooks/        shared React hooks
  pages/        page components
  routes/       TanStack Router route definitions
  store/        zustand stores
  styles/       Tailwind entry
e2e/            Playwright tests
```

## Roadmap (not yet implemented)

- [ ] `netlify.toml` + Netlify Functions directory
- [ ] Neon Postgres + Drizzle schema (reservations, availability)
- [ ] iCal import/export functions
- [ ] Stripe payment-intent + webhook functions
- [ ] Booking UI (availability calendar + reservation form)
