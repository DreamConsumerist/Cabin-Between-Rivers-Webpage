import {
	pgTable,
	integer,
	varchar,
	text,
	date,
	timestamp,
	uniqueIndex,
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

// Bookings made on THIS site. `status` drives availability:
//   pending   — held while the guest completes payment (see holdExpiresAt)
//   confirmed — payment succeeded (set by the Stripe webhook)
//   expired   — hold lapsed before payment (freed by the expire-holds cron)
//   cancelled — cancelled after confirmation
export const reservations = pgTable("reservations", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
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

// Single-row configuration, editable without a redeploy.
export const settings = pgTable("settings", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	nightlyRate: integer("nightly_rate").notNull().default(0),
	cleaningFee: integer("cleaning_fee").notNull().default(0),
	minNights: integer("min_nights").notNull().default(1),
	airbnbIcalUrl: text("airbnb_ical_url"),
	vrboIcalUrl: text("vrbo_ical_url"),
	// Plain text, admin-edited (see netlify/functions/admin-terms.mts). Null
	// until an admin saves their own copy — lib/terms.ts's DEFAULT_TERMS_CONTENT
	// is served in the meantime.
	termsContent: text("terms_content"),
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
