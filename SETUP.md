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
  processed_webhook_events, gallery_photos, price_overrides, double_booking_conflicts),
  `db/client.ts` (Drizzle `netlify-db` adapter), `drizzle.config.ts`.
- ✅ Packages: `@netlify/database` + `drizzle-orm@beta` + `drizzle-kit@beta` (the beta channel is
  what ships the `drizzle-orm/netlify-db` adapter Netlify's docs recommend).
- ✅ First migration generated (timestamp-prefixed): `netlify/database/migrations/<ts>_*/migration.sql`.
- ✅ Scripts: `pnpm db:generate` (create migrations), `pnpm db:studio` (inspect data).
- ✅ Booking core (Phase 3): `check-availability`, `create-booking`, `expire-holds` — verified
  locally, including the DB-level double-booking guarantee (409 on overlap, no duplicate row).
- ✅ Stripe (Phase 4): `create-payment.mts` (embedded Checkout Session), `stripe-webhook.mts`
  (signature-verified, idempotent confirmation) — verified locally.
- ✅ Booking UI (Phase 6): `/booking` 3-step wizard (calendar → guest details → embedded Stripe
  checkout) and `/booking/confirmation`, under `src/features/booking/` + `src/pages/`. Verified in
  a real browser end-to-end except the embedded payment form itself, which needs your Stripe
  publishable key locally — see Phase 6 below.
- ✅ Admin panel: password-gated `/admin` page to manage bookings (guest info, status, uploaded ID),
  the About-page gallery (upload, caption, reorder, delete), pricing/iCal settings, and the Terms &
  Conditions text — all without a redeploy. See "Admin panel" below.
- ✅ Photo ID upload: the Terms step of the booking flow now requires a guest to upload a photo ID
  (image only) before they can continue to payment. Stored privately in Netlify Blobs (a separate
  `id-photos` store from the public gallery), only ever viewable by an admin via `/admin` → Bookings.
- ✅ iCal sync (Phase 5), both directions: **import** pulls Airbnb/Vrbo `.ics` URLs (set from the
  `/admin` iCal tab) into `external_blocks`, on save, on demand ("Sync now"), and every 30 minutes
  via `netlify/functions/ical-sync.mts`; **export** serves the site's own confirmed/held
  reservations as a `.ics` feed at `netlify/functions/calendar-export.mts`, gated by a secret token
  (`settings.export_token`, lazily generated the first time the iCal tab loads, rotatable via
  "Regenerate URL") so Airbnb/Vrbo can import bookings made directly on the site.
- ✅ Double-booking conflict detection + resolution: `lib/conflicts.ts` flags a row in
  `double_booking_conflicts` whenever the iCal sync finds an external block overlapping an active
  reservation, or the Stripe webhook confirms a payment into dates that were rebooked in the
  meantime. The `/admin` Conflicts tab lists open/resolved conflicts and lets you mark one resolved
  or, for one tied to a live reservation, cancel & refund it directly (auto-marking the conflict
  resolved). If `RESEND_API_KEY`/`NOTIFICATION_FROM_EMAIL` are set (see "Later phases" below), the
  address(es) configured on the `/admin` Notifications tab also get emailed when a conflict is
  flagged, and whenever a booking made directly on the site is confirmed.
- ✅ Admin Bookings tab: alongside the existing list, a month-at-a-glance calendar
  (`src/features/admin/BookingsCalendar.tsx`) tints each reservation's nights by status
  (pending/confirmed), shows the guest's name on their check-in day, highlights a reservation's
  whole date range on hover, and clicking a day jumps to that reservation in the list below.

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

## Phase 4 — Stripe (test locally)

Uses **embedded Stripe Checkout**: our server creates a Checkout Session, the browser mounts
Stripe's hosted payment form inline (Phase 6 will wire up that UI), and a **webhook** — not the
browser redirect — is what actually confirms the reservation. This keeps the amount charged
server-trusted and makes retried/duplicate webhook deliveries safe (idempotent on `event.id`).

1. **Get test-mode API keys**: Stripe Dashboard → Developers → API keys (make sure you're in
   **Test mode**, toggle top-right). Copy the *Secret key* (`sk_test_...`).
2. **Install the Stripe CLI** and log in (this also gives you `stripe trigger` for testing):
   https://docs.stripe.com/stripe-cli — then `stripe login`.
3. **Set the secret key** for local dev:
   ```bash
   netlify env:set STRIPE_SECRET_KEY sk_test_...
   ```
4. **Forward webhooks to your local server** (leave running in its own terminal):
   ```bash
   stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
   ```
   It prints a webhook signing secret like `whsec_...` — set that too:
   ```bash
   netlify env:set STRIPE_WEBHOOK_SECRET whsec_...
   ```
   > Restart `netlify dev` after setting new env vars so it picks them up.
5. **Create a payment session** for a pending reservation (use a `reservationId` from a Phase 3
   `create-booking` test — the hold must not have expired):
   ```powershell
   $body = @{ reservationId = 1 } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri http://localhost:8888/api/create-payment -ContentType "application/json" -Body $body
   ```
   Expect back a `clientSecret` (that's what Phase 6's frontend will hand to Stripe.js to mount
   the embedded payment form).
6. **Sanity-check the webhook mechanics** (signature verification + idempotency) without a real
   session:
   ```bash
   stripe trigger checkout.session.completed
   ```
   Watch the `stripe listen` terminal — it should show a `200` response from our function. This
   proves signature verification and idempotency (`processed_webhook_events`) work; it won't flip
   a real reservation to `confirmed` since the synthetic event has no `reservationId` in its
   metadata. **Full happy-path testing (real session → embedded form → webhook flips reservation
   to `confirmed`) happens in Phase 6**, once there's a UI to complete a real Checkout Session with
   Stripe's test card `4242 4242 4242 4242`.

## Phase 6 — Booking UI (test locally)

The `/booking` page is a 3-step wizard: pick dates on a calendar → guest details form → embedded
Stripe checkout. `check-availability` now also returns `pricing` (nightly rate, cleaning fee, min
nights) so the calendar can show an estimated total before committing. A new
`GET /api/reservation-status?reservationId=` endpoint (returns **only** `{ status }` — no guest PII,
since it's unauthenticated) lets the confirmation page poll until the webhook flips a reservation to
`confirmed`.

Everything works locally already **except the actual embedded payment form**, which needs your
Stripe **publishable** key (safe to expose in the browser — it's prefixed `VITE_` so Vite bundles it
client-side):

```bash
netlify env:set VITE_STRIPE_PUBLISHABLE_KEY pk_test_...
```
> Restart `netlify dev` after setting it.

Then open `http://localhost:8888/` → **Check availability** → pick dates → fill guest details →
you should see Stripe's embedded card form mount in the Payment step. Use Stripe's test card
`4242 4242 4242 4242`, any future expiry, any CVC. After paying, Stripe redirects to
`/booking/confirmation`, which polls `reservation-status` until the webhook (from Phase 4) flips it
to `confirmed`.

## Admin panel — gallery + pricing (test locally)

`/admin` is a single password-gated page (no per-user accounts — this is a one-operator site) with
tabs for Bookings, Gallery, Pricing, iCal, Conflicts, and Terms. This section covers signing in plus
the Gallery/Pricing tabs; Bookings/iCal/Conflicts are covered in Phase 5 below.

**How auth works:** one shared password, checked against `ADMIN_PASSWORD`. On success, a Netlify
Function signs a session token (HMAC, `ADMIN_SESSION_SECRET`) into an HttpOnly cookie — no
database-backed sessions, no third-party auth service. **Photo storage:** uploaded images are
stored in Netlify Blobs (a new store, `gallery-photos`, auto-provisioned — no setup needed locally
or in production); only display metadata (caption, dimensions, order) lives in Postgres, in the new
`gallery_photos` table.

1. **Set the two secrets** (pick a real password and a long random string for the session secret):
   ```bash
   netlify env:set ADMIN_PASSWORD "choose-a-real-password"
   netlify env:set ADMIN_SESSION_SECRET "$(openssl rand -hex 32)"
   ```
   > Restart `netlify dev` after setting new env vars so it picks them up.
2. **Apply the new migration** (adds the `gallery_photos` table):
   ```bash
   netlify database migrations apply
   ```
3. **Sign in**: open `http://localhost:8888/admin`, enter the password you set. You should land on
   the dashboard (Gallery / Pricing tabs) instead of the login form.
4. **Upload the initial photos**: the six placeholder images that used to be hardcoded in
   `src/pages/About.tsx` now need to be (re-)uploaded through the Gallery tab — pick a file, add a
   caption, **Add photo**. Repeat for each; use the ↑/↓ buttons to set display order. The mosaic
   layout on `/about` picks its own tall/wide tiling per photo automatically (based on the image's
   aspect ratio), so order is the only thing you control.
5. **Set pricing**: Pricing tab — nightly rate and cleaning fee are entered in dollars and stored as
   cents server-side (same convention as the booking flow). Saving here is what `check-availability`
   and `create-booking` read from — no code change needed to adjust prices going forward.
6. **Verify the public side**: `http://localhost:8888/about` should show the photos you just
   uploaded in the mosaic gallery, and `http://localhost:8888/api/check-availability` should reflect
   the new pricing.

## Phase 5 — iCal sync + conflict resolution (test locally)

Two directions: **import** pulls Airbnb/Vrbo's own `.ics` blocks in so this site's availability
reflects bookings made elsewhere; **export** serves this site's reservations as a `.ics` feed so
Airbnb/Vrbo can do the same in reverse. A conflict is flagged (and optionally emailed) whenever the
two sides still disagree.

1. **Apply pending migrations** (adds `double_booking_conflicts` and `settings.export_token`, among
   others accumulated since Phase 3):
   ```bash
   netlify database migrations apply
   ```
2. **Import**: `/admin` → iCal tab → paste an Airbnb and/or Vrbo calendar URL (each platform's
   listing → Calendar → Sync calendars → Export). Save, then click **Sync now**. Successful/failed
   pulls per source show inline. It also runs automatically on save and every 30 minutes
   (`netlify/functions/ical-sync.mts`).
3. **Export**: same tab, further down — an **Export feed URL** is shown (generated automatically the
   first time this tab loads). Copy it into Airbnb's and Vrbo's calendar **import** field (the
   reverse of step 2). **Regenerate URL** invalidates the old one if it ever leaks — you'd need to
   re-paste the new one on both platforms.
4. **See a conflict get flagged**: book overlapping dates on the site and in an externally-synced
   calendar (or trigger the rarer Stripe-race path by cancelling/rebooking a reservation right as its
   payment confirms), then check the **Conflicts** tab. An open conflict shows its source (Airbnb /
   Vrbo / Payment race), the overlapping dates, and — if it's tied to a live reservation — a
   **Cancel & refund reservation** button (auto-marks the conflict resolved); otherwise just **Mark
   resolved**.
5. **Optional — email alerts**: without `RESEND_API_KEY`/`NOTIFICATION_FROM_EMAIL` set (see "Later
   phases" below), flagging a conflict is silent except for the Conflicts tab and a log line. Set
   both to also get emailed at the address(es) configured in the iCal tab's notification field.

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

- **Stripe (Phase 4 + 6):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `VITE_STRIPE_PUBLISHABLE_KEY` — see the Phase 4 and Phase 6 sections above.
- **iCal (Phase 5):** no env vars — your Airbnb/Vrbo calendar URLs and the generated export feed
  token live in the `settings` table instead, set from the iCal admin tab. See Phase 5 above for the
  local walkthrough.
- **Email notifications (double-booking warnings):** `RESEND_API_KEY` (from resend.com) and
  `NOTIFICATION_FROM_EMAIL` (a Resend-verified sending address). Fires when a synced Airbnb/Vrbo
  block overlaps a reservation already active on the site, or when a Stripe payment confirms into
  dates that were rebooked in the meantime. The recipient address(es) are admin-configurable from
  the iCal tab in `/admin` (stored in the `settings` table, not an env var), same reasoning as the
  iCal URLs above.
- **Admin panel:** `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` — see "Admin panel" above.

---

## Where we are

Phases 1–3 are done and **verified locally**: skeleton, database, and booking core (availability,
create-booking with overlap-proof holds, expire-holds cron). The double-booking guarantee was
confirmed live — a second overlapping `create-booking` call cleanly returns HTTP 409 ("Those dates
were just taken") with no duplicate row, and `check-availability` reflects the held dates.

Phase 4 (Stripe) is **verified locally**: `create-payment` returns a real Stripe `clientSecret` for
a live pending reservation (and correctly 409s for a lapsed/consumed one), and the webhook's
signature verification + idempotency guard are both confirmed (a resent event does not create a
duplicate `processed_webhook_events` row).

Phase 6 (Booking UI) is **built and verified in a real browser** (Playwright-driven click-through):
the calendar, guest-details form with validation, booking creation, and hold countdown all work
end-to-end. The only untested piece is the actual embedded Stripe form rendering, which needs
`VITE_STRIPE_PUBLISHABLE_KEY` set locally (see Phase 6 above) — without it, the payment step shows
that error inline instead of the form, by design. Once that key is set, a full real-money-free test
purchase with Stripe's test card will exercise the last untested path: webhook flips the reservation
to `confirmed` and the confirmation page reflects it.

The **admin panel** (login, session cookie, and Netlify Blobs photo storage) is **verified in a real
browser and live locally**: signing in with the wrong password 401s, the right password lands on
the dashboard, tab switching between Gallery/Pricing works, and a direct Blobs put/get/delete round
trip succeeded. What I could **not** verify in this environment is the Postgres-backed half
(`admin-settings` GET/PUT, gallery photo list/upload/delete/reorder) — the local Netlify DB
(pglite) failed to start here (`RuntimeError: Aborted()`), which also broke the *pre-existing*
`check-availability` endpoint identically, so it's an environment issue, not something introduced
by this change. Please run through the "Admin panel" steps above once your local DB starts
normally — if you hit the same pglite abort, that's worth its own investigation (possibly a Node
version incompatibility, since this was tried on Node 24).

Phase 5 (iCal sync, both directions) and the double-booking conflict-resolution tool are **built**
but not yet run through end-to-end locally by anyone — please work through the new "Phase 5" section
above once your local DB is up (see the pglite note just above). The admin Bookings-tab calendar view
(`BookingsCalendar.tsx`) was checked in isolation with mock reservation data in a real browser
(Playwright screenshots): cell sizing/name truncation against the rounded corners and the
hover-highlight-whole-reservation behavior across the grid gap both confirmed working — but it
hasn't yet been exercised against real reservations end-to-end.

Next up: confirm Phase 5 locally, then Phase 7 (go live) — see "First production deploy" above.

---

## Known issues / TODO

- **Gallery lightbox has no swipe navigation on mobile** — `src/components/ui/Gallery.tsx`. The
  `Lightbox` component only advances photos via the on-screen chevron buttons (`onPrev`/`onNext`) or
  arrow keys (`ArrowLeft`/`ArrowRight` in its `keydown` handler) — there's no touch/swipe gesture, so
  on mobile a guest has to close out of the open photo and tap a different thumbnail to see the next
  one, instead of swiping left/right like the desktop click-through experience. Needs a touch handler
  (`onTouchStart`/`onTouchEnd`, comparing X position, calling the existing `onPrev`/`onNext`) added to
  the image/lightbox container.

- **"Booked!" confirmation needs a more satisfying splash** — `src/pages/BookingConfirmation.tsx`. The
  confirmed state right now is just a plain heading and one line of text ("You're booked! Reservation
  #X is confirmed."). Wants real design treatment — an animation/illustration, actual booking details
  (dates, total, cabin name), maybe a "what happens next" section — instead of the current bare-bones
  placeholder. Same idea likely applies to the initial "Booked!" moment before the confirmation page
  too (a splash/transition rather than just swapping text once `status` flips to `confirmed`).

- **Guest email follow-up with receipt** — nothing currently emails the guest anything. After
  `stripe-webhook.mts` confirms a reservation, it should trigger a confirmation email with a receipt
  (dates, amount charged, cabin details) — probably via Stripe's own receipt emails as a starting
  point, or reusing the Resend integration `lib/mailer.ts` already has wired up for the double-booking
  alert (see "Later phases" env vars above), just with a new template/trigger rather than a whole new
  provider to choose and set up.

- **Admin email notification on new bookings** — the double-booking conflict alert
  (`lib/mailer.ts`'s `notifyDoubleBooking`, see Phase 5 above) is the only email currently wired up.
  Nothing notifies you when an ordinary new booking comes in, or of server-side issues (e.g. an
  unhandled function error — ties into the stack-trace item below, since right now those errors only
  ever reach a log line, never a person) — you'd only find out by checking `/admin` or the function
  logs directly. Same Resend integration, just a new trigger.

- **A spot for guests to leave a review** — nothing in the booking/confirmation flow prompts a guest
  for a review after their stay. Could be as simple as a "how was your stay?" link in the post-stay
  follow-up email above pointing to an external review platform (Airbnb/Google/etc.), or a review
  feature built into the site itself — worth deciding which before building either the email or the
  page.

- **Functions leak raw stack traces on unhandled errors** — `netlify/functions/*.mts`. Most handlers
  have no top-level try/catch (a few do, like `admin-gallery.mts` and `create-booking.mts`, but most
  don't), so an unexpected exception — like the missing-env-var 502 hit while diagnosing the admin
  login issue on 2026-07-23 — falls through to Netlify's raw Lambda error response: a full stack
  trace with internal file paths (`file:///var/task/netlify/functions/admin-login.mjs:34:21`),
  returned to *anyone* who hits the endpoint, not just admins. Needs a shared wrapper (e.g. in
  `lib/http.ts`) around every handler that catches anything unhandled, logs the real error
  server-side, and returns a generic `error("Something went wrong", 500)` to the caller instead.

- **Admin panel / booking flow need clearer error messages for non-technical operators** — day-to-day
  site management (uploading photos, checking bookings) is being handed off to people who aren't
  going to read a stack trace or a network tab. Right now several failure paths are either silent or
  too vague to relay: the About page's gallery preload swallows fetch errors entirely by design (see
  `src/routes/about.ts` — a bad *preload* shouldn't break navigation, though `useGalleryPhotos` itself
  does show "Couldn't load the gallery." on the page itself), the admin dashboard's error states are
  generic one-line strings with nothing to reference, and a backend failure (like the stack-trace
  issue above) just looks like "the page is broken" with no detail. Once the operator isn't you,
  "it's broken" isn't actionable — needs a consistent pattern across the admin panel and booking flow:
  a plain-language message (what failed) plus something concrete to relay when reporting it
  (timestamp, and ideally a short reference/request id that shows up in the function logs too, so you
  can find the matching error without guessing).

- **Payment succeeds but the dates are already gone (rare race)** — `netlify/functions/stripe-webhook.mts`.
  If a reservation's hold lapses (or gets cancelled by the tab-close beacon in `Booking.tsx`) right as
  its Stripe payment completes, and someone else books those same dates first, the webhook's
  confirm-update hits the DB's overlap constraint and can't go through. The guest has been charged
  with no confirmed reservation. This flags a `double_booking_conflicts` row and emails via
  `lib/mailer.ts`'s `notifyDoubleBooking` (same path the iCal sync uses for an external-block
  conflict), and an admin can now cancel & refund it directly from the Conflicts tab (see Phase 5
  above) instead of only reading logs.
