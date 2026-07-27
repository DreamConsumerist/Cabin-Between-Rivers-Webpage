import {
	pgTable,
	integer,
	varchar,
	text,
	date,
	timestamp,
	uniqueIndex,
	index,
	boolean,
} from "drizzle-orm/pg-core";

// All money is stored as integer CENTS (matches Stripe's smallest-currency-unit
// convention and avoids floating-point rounding).

// The reservation lifecycle. Not a DB-level enum/CHECK constraint (the column
// is still a plain varchar — changing that needs a migration), but every
// backend read/write of `status` should go through this type so a typo or an
// unsynchronized new value is a compile error instead of a silent orphan
// state. See lib/availability.ts, netlify/functions/stripe-webhook.mts, and
// netlify/functions/create-payment.mts for where these are checked/set.
export const RESERVATION_STATUSES = ["pending", "confirmed", "expired", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

// Bookable configurations of the one physical cabin (e.g. "Whole Cabin" vs
// "Downstairs Only") — NOT separate properties. Exactly one row has
// isDefault true; it's used whenever settings.configurationSwitchingEnabled
// is false or a guest hasn't picked one yet. Each configuration has its own
// pricing, but availability blocking (reservations/external_blocks/
// manual_blocks and their no-overlap constraints) is deliberately NOT scoped
// by configuration — booking either one occupies the same physical property,
// so it must block the other for the same dates. See
// reservations_no_overlap/manual_blocks_no_overlap: they stay global on
// purpose. Only price_overrides is scoped per-configuration (see below),
// since seasonal pricing can legitimately differ between configurations.
export const bookingConfigurations = pgTable("booking_configurations", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: varchar({ length: 255 }).notNull(),
	// Guest-facing blurb shown on the booking flow's configuration-picker step
	// (see Booking.tsx) — e.g. what's included, sleeping arrangements. Null
	// until an admin sets one; the picker just omits it in that case.
	description: text("description"),
	nightlyRate: integer("nightly_rate").notNull().default(0),
	cleaningFee: integer("cleaning_fee").notNull().default(0),
	minNights: integer("min_nights").notNull().default(1),
	// Extra-guest surcharge: guests beyond baseOccupancy each add
	// extraGuestFee (cents) to the subtotal — see
	// lib/booking.ts's extraGuestFeeCents.
	baseOccupancy: integer("base_occupancy").notNull().default(4),
	extraGuestFee: integer("extra_guest_fee").notNull().default(2500),
	isDefault: boolean("is_default").notNull().default(false),
	position: integer().notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// Bookings made on THIS site. `status` drives availability:
//   pending   — held while the guest completes payment (see holdExpiresAt)
//   confirmed — payment succeeded (set by the Stripe webhook)
//   expired   — hold lapsed before payment (freed by the expire-holds cron)
//   cancelled — cancelled after confirmation
export const reservations = pgTable("reservations", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	// Which configuration the guest booked (Whole Cabin vs Downstairs Only) —
	// display/pricing/receipt only. Deliberately NOT part of
	// reservations_no_overlap: two reservations for different configurations
	// but overlapping dates must still conflict, since they're the same
	// physical property.
	configurationId: integer("configuration_id")
		.notNull()
		.references(() => bookingConfigurations.id),
	checkIn: date("check_in").notNull(),
	checkOut: date("check_out").notNull(),
	guestName: varchar("guest_name", { length: 255 }).notNull(),
	guestEmail: varchar("guest_email", { length: 255 }).notNull(),
	guestPhone: varchar("guest_phone", { length: 50 }),
	guests: integer().notNull().default(1),
	amountTotal: integer("amount_total").notNull(),
	status: varchar({ length: 20 }).$type<ReservationStatus>().notNull().default("pending"),
	holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
	stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
	// Set once the guest uploads a photo ID during the Terms step (required
	// before payment — see TermsStep.tsx). Bytes live in Netlify Blobs' private
	// `id-photos` store (lib/blobs.ts), keyed by this column, same pattern as
	// galleryPhotos.blobKey — this is sensitive PII, so unlike gallery photos it
	// is only ever served through an admin-gated endpoint
	// (netlify/functions/admin-id-photo.mts), never a public one.
	idPhotoBlobKey: varchar("id_photo_blob_key", { length: 255 }),
	// Random secret minted at creation (see insertPendingReservation), never
	// exposed anywhere except the guest's own confirmation email — lets a
	// guest cancel/refund their own CONFIRMED reservation later (see
	// netlify/functions/cancel-my-reservation.mts) without needing an
	// account/login, same "unguessable link is the credential" model as
	// settings.exportToken. Guest-facing cancel-reservation.mts (pending
	// holds only, same browsing session) doesn't need this — only a
	// stand-alone confirmed reservation, reachable days later from an email,
	// does. Nullable rather than backfilled NOT NULL — existing rows from
	// before this feature shipped simply have no self-cancel link (their
	// confirmation email never included one either); every new row gets one.
	cancellationToken: varchar("cancellation_token", { length: 64 }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// Dates blocked by Airbnb / Vrbo, learned via the iCal import cron.
// (source, uid) is unique so re-imports update rows instead of duplicating them.
export const externalBlocks = pgTable(
	"external_blocks",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		source: varchar({ length: 20 }).notNull(), // 'airbnb' | 'vrbo'
		uid: varchar({ length: 512 }).notNull(),
		checkIn: date("check_in").notNull(),
		checkOut: date("check_out").notNull(),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("external_blocks_source_uid_idx").on(table.source, table.uid),
	]
);

// Admin-created blocks with no guest or external-platform booking behind
// them — e.g. the cabin is closed for maintenance, or family/friends are
// staying. Blocks guest availability the same way a reservation or synced
// external_blocks row does (see getBlockedRanges/hasManualBlockOverlap in
// lib/availability.ts), but is created/removed directly by an admin rather
// than by a guest checkout or the iCal sync cron.
export const manualBlocks = pgTable("manual_blocks", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	checkIn: date("check_in").notNull(),
	checkOut: date("check_out").notNull(),
	note: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// Persisted record of a detected double-booking conflict (an external iCal
// block overlapping a live reservation, or a Stripe payment confirming after
// the dates were rebooked — see lib/icalSync.ts and
// netlify/functions/stripe-webhook.mts, both of which call
// lib/conflicts.ts's flagDoubleBooking). This is the "what's still open"
// system of record the email alert (lib/mailer.ts) alone can't answer.
// Resolving a row here never touches Stripe or the reservation itself on its
// own — see netlify/functions/admin-cancel-reservation.mts for the separate
// action that actually cancels/refunds, which the admin UI chains after a
// successful cancel to auto-resolve the row.
export const DOUBLE_BOOKING_SOURCES = ["airbnb-sync", "vrbo-sync", "stripe-webhook"] as const;
export type DoubleBookingSource = (typeof DOUBLE_BOOKING_SOURCES)[number];

export const doubleBookingConflicts = pgTable(
	"double_booking_conflicts",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		source: varchar({ length: 20 }).$type<DoubleBookingSource>().notNull(),
		checkIn: date("check_in").notNull(),
		checkOut: date("check_out").notNull(),
		detail: text().notNull(),
		// Reservations are never hard-deleted (only status-flipped — see the
		// reservations table above), so default NO ACTION is fine here. First
		// .references() in this schema — no other on-delete convention exists.
		reservationId: integer("reservation_id").references(() => reservations.id),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		resolutionNote: text("resolution_note"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("double_booking_conflicts_resolved_at_idx").on(table.resolvedAt)]
);

// Single-row configuration, editable without a redeploy.
export const settings = pgTable("settings", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	// Whether the booking flow shows a "pick your configuration" step before
	// dates. When false, booking silently uses the isDefault
	// bookingConfigurations row, same as before configurations existed.
	configurationSwitchingEnabled: boolean("configuration_switching_enabled")
		.notNull()
		.default(false),
	airbnbIcalUrl: text("airbnb_ical_url"),
	vrboIcalUrl: text("vrbo_ical_url"),
	// Comma-separated recipient list (see lib/mailer.ts), parsed into a
	// string[] at the application layer — same single-text-field convention as
	// termsContent below, not a Postgres array/jsonb column. Admin-configurable
	// here (not an env var) via its own Notifications tab
	// (netlify/functions/admin-notifications.mts). Used for two email types:
	// a booking-confirmed notice (Stripe webhook) and a double-booking warning
	// (iCal sync or a Stripe payment race). Developer-facing error alerts go
	// through Sentry instead (see lib/sentry.ts), not this list.
	notificationEmails: text("notification_emails"),
	// Plain text, admin-edited (see netlify/functions/admin-terms.mts). Null
	// until an admin saves their own copy — lib/terms.ts's DEFAULT_TERMS_CONTENT
	// is served in the meantime.
	termsContent: text("terms_content"),
	// Secret token gating GET /api/calendar-export (see netlify/functions/
	// calendar-export.mts). Null until an admin first opens the iCal tab
	// (lazy-generated) or explicitly regenerates it.
	exportToken: varchar("export_token", { length: 64 }),
});

// Seasonal price overrides, admin-managed from /admin. `nightlyRate` (cents)
// applies to every night in [checkIn, checkOut) instead of the configuration's
// own nightlyRate. Scoped per-configuration (unlike reservations/
// external_blocks/manual_blocks) since seasonal pricing can legitimately
// differ between "Whole Cabin" and "Downstairs Only" — see
// bookingConfigurations above. A GiST EXCLUDE constraint (added by hand in a
// follow-up migration, since drizzle-kit can't express EXCLUDE — see
// reservations_no_overlap for the same pattern) rejects overlapping ranges
// *within the same configuration*, so at most one override ever covers a
// given configuration's night, while two different configurations can each
// have their own override for the same dates.
export const priceOverrides = pgTable("price_overrides", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	configurationId: integer("configuration_id")
		.notNull()
		.references(() => bookingConfigurations.id),
	checkIn: date("check_in").notNull(),
	checkOut: date("check_out").notNull(),
	nightlyRate: integer("nightly_rate").notNull(),
	label: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// Stripe webhook idempotency: a processed event.id is recorded so retried
// webhook deliveries never double-fulfill a booking.
export const processedWebhookEvents = pgTable("processed_webhook_events", {
	eventId: varchar("event_id", { length: 255 }).primaryKey(),
	processedAt: timestamp("processed_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// About-page gallery photos, managed from /admin. Image bytes live in Netlify
// Blobs (keyed by blobKey); this row is the display metadata. width/height are
// the image's natural pixel dimensions, captured at upload time so the gallery
// can pick a sensible mosaic layout without re-fetching the image client-side.
export const galleryPhotos = pgTable("gallery_photos", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	blobKey: varchar("blob_key", { length: 255 }).notNull(),
	alt: varchar({ length: 255 }),
	width: integer().notNull(),
	height: integer().notNull(),
	position: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
