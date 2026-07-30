import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { externalBlocks, manualBlocks, reservations, settings } from "../db/schema";
import { HOLD_MINUTES } from "./booking";
import { isExclusionViolation } from "./dbErrors";
import type { ExportableBlock } from "./icalExport";

export type BlockedRange = {
	checkIn: string;
	checkOut: string;
	source: "reservation" | "airbnb" | "vrbo" | "manual";
};

// A reservation blocks dates when it is confirmed, or pending with a hold that
// hasn't lapsed yet. (Lapsed pending holds are treated as free.)
const activeReservation = () =>
	or(
		eq(reservations.status, "confirmed"),
		and(
			eq(reservations.status, "pending"),
			gt(reservations.holdExpiresAt, sql`now()`)
		)
	);

// SQL predicate: does [checkIn, checkOut) overlap the given row's date range?
export const overlaps = (
	col: { checkIn: unknown; checkOut: unknown },
	checkIn: string,
	checkOut: string
) =>
	sql`daterange(${col.checkIn}, ${col.checkOut}, '[)') && daterange(${checkIn}::date, ${checkOut}::date, '[)')`;

// Flip pending reservations whose hold has lapsed to `expired`, freeing their
// dates. Called at the start of create-booking so bookings never depend on the
// scheduled cleanup having run.
export const expireLapsedHolds = async (): Promise<void> => {
	await db
		.update(reservations)
		.set({ status: "expired" })
		.where(
			and(
				eq(reservations.status, "pending"),
				lt(reservations.holdExpiresAt, sql`now()`)
			)
		);
};

// All currently-blocked date ranges (active reservations + external blocks +
// manual blocks), for rendering the availability calendar.
export const getBlockedRanges = async (): Promise<BlockedRange[]> => {
	const [res, ext, manual] = await Promise.all([
		db
			.select({
				checkIn: reservations.checkIn,
				checkOut: reservations.checkOut,
			})
			.from(reservations)
			.where(activeReservation()),
		db
			.select({
				checkIn: externalBlocks.checkIn,
				checkOut: externalBlocks.checkOut,
				source: externalBlocks.source,
			})
			.from(externalBlocks),
		db
			.select({
				checkIn: manualBlocks.checkIn,
				checkOut: manualBlocks.checkOut,
			})
			.from(manualBlocks),
	]);

	return [
		...res.map((r) => ({ ...r, source: "reservation" as const })),
		...ext.map((e) => ({
			checkIn: e.checkIn,
			checkOut: e.checkOut,
			source: e.source as "airbnb" | "vrbo",
		})),
		...manual.map((m) => ({ ...m, source: "manual" as const })),
	];
};

// True if the requested dates overlap an Airbnb/Vrbo block. (Reservation-vs-
// reservation overlap is enforced atomically by the DB EXCLUDE constraint on
// insert; external blocks change only via the cron, so a query is sufficient.)
export const hasExternalBlockOverlap = async (
	checkIn: string,
	checkOut: string
): Promise<boolean> => {
	const rows = await db
		.select({ id: externalBlocks.id })
		.from(externalBlocks)
		.where(overlaps(externalBlocks, checkIn, checkOut))
		.limit(1);
	return rows.length > 0;
};

// Site-direct reservations (see activeReservation()) plus admin manual
// blocks — the data source for the public iCal export feed
// (lib/icalExport.ts). Manual blocks are included so Airbnb/Vrbo actually see
// dates an admin has closed off on this site (e.g. "family staying") instead
// of only finding out via a conflict after the fact — see
// netlify/functions/calendar-export.mts for why externalBlocks are excluded.
// Deliberately selects only id/checkIn/checkOut, never guest name/email/phone
// or the manual block's free-text note.
export const getExportableBlocks = async (): Promise<ExportableBlock[]> => {
	const [res, manual] = await Promise.all([
		db
			.select({
				id: reservations.id,
				checkIn: reservations.checkIn,
				checkOut: reservations.checkOut,
			})
			.from(reservations)
			.where(activeReservation())
			.orderBy(reservations.checkIn),
		db
			.select({
				id: manualBlocks.id,
				checkIn: manualBlocks.checkIn,
				checkOut: manualBlocks.checkOut,
			})
			.from(manualBlocks)
			.orderBy(manualBlocks.checkIn),
	]);

	return [
		...res.map((r) => ({ ...r, source: "reservation" as const })),
		...manual.map((m) => ({ ...m, source: "manual" as const })),
	];
};

export type ActiveReservationOverlap = {
	id: number;
	checkIn: string;
	checkOut: string;
};

// Active site reservations (confirmed, or pending with a live hold) that
// overlap [checkIn, checkOut) — used by the iCal sync (lib/icalSync.ts) and
// the Stripe webhook to detect a double-booking conflict: a newly-synced
// external block, or a payment race, landing on dates the site already
// considers taken.
export const getActiveReservationsOverlapping = async (
	checkIn: string,
	checkOut: string
): Promise<ActiveReservationOverlap[]> => {
	return db
		.select({
			id: reservations.id,
			checkIn: reservations.checkIn,
			checkOut: reservations.checkOut,
		})
		.from(reservations)
		.where(and(activeReservation(), overlaps(reservations, checkIn, checkOut)));
};

export const getSettings = async () => {
	const rows = await db.select().from(settings).limit(1);
	return rows[0] ?? null;
};

export type ConfigurationSwitchingUpdate = {
	configurationSwitchingEnabled: boolean;
};

// The settings table is always a single row (see db/schema.ts) — update it if
// it exists, otherwise create it (e.g. before it's ever been seeded). Scoped
// to just this one flag — see updateIcalUrls/updateTermsContent for the same
// single-row-upsert shape scoped to their own fields, so the Configurations,
// iCal, and Terms admin tabs never resend each other's fields just to save
// their own.
export const updateConfigurationSwitching = async (update: ConfigurationSwitchingUpdate) => {
	const existing = await getSettings();
	if (existing) {
		const rows = await db
			.update(settings)
			.set(update)
			.where(eq(settings.id, existing.id))
			.returning();
		return rows[0]!;
	}
	const rows = await db.insert(settings).values(update).returning();
	return rows[0]!;
};

export type IcalUpdate = {
	airbnbIcalUrl: string | null;
	vrboIcalUrl: string | null;
};

// Same single-row-upsert shape as `updatePricingSettings`, but scoped to just
// the Airbnb/Vrbo iCal URLs — see updateNotificationEmails/updateTermsContent
// for the same shape scoped to their own tab's field(s).
export const updateIcalUrls = async (update: IcalUpdate) => {
	const existing = await getSettings();
	if (existing) {
		const rows = await db
			.update(settings)
			.set(update)
			.where(eq(settings.id, existing.id))
			.returning();
		return rows[0]!;
	}
	const rows = await db.insert(settings).values(update).returning();
	return rows[0]!;
};

export type NotificationEmailsUpdate = {
	notificationEmails: string | null;
};

// Same single-row-upsert shape as `updatePricingSettings`, but scoped to just
// the notification-recipient list — kept separate so the Notifications admin
// tab doesn't need to resend the iCal URLs (and vice versa) just to save its
// own field.
export const updateNotificationEmails = async (update: NotificationEmailsUpdate) => {
	const existing = await getSettings();
	if (existing) {
		const rows = await db
			.update(settings)
			.set(update)
			.where(eq(settings.id, existing.id))
			.returning();
		return rows[0]!;
	}
	const rows = await db.insert(settings).values(update).returning();
	return rows[0]!;
};

const setExportToken = async (token: string): Promise<string> => {
	const existing = await getSettings();
	if (existing) {
		await db
			.update(settings)
			.set({ exportToken: token })
			.where(eq(settings.id, existing.id));
	} else {
		await db.insert(settings).values({ exportToken: token });
	}
	return token;
};

// Lazy-generates the public export feed's secret token on first read — called
// from the admin-gated GET /api/admin-ical so the admin sees a working feed
// URL immediately, with no separate "generate" step. The public export
// endpoint (netlify/functions/calendar-export.mts) must never call this —
// only plain getSettings() — so an unauthenticated request can't trigger
// token creation as a side effect.
export const getOrCreateExportToken = async (): Promise<string> => {
	const existing = await getSettings();
	if (existing?.exportToken) return existing.exportToken;
	return setExportToken(randomBytes(24).toString("hex"));
};

// Explicit admin action (netlify/functions/admin-ical-export-token.mts) that
// invalidates the old export feed URL by minting a new token.
export const regenerateExportToken = async (): Promise<string> =>
	setExportToken(randomBytes(24).toString("hex"));

// Same single-row-upsert shape as `updatePricingSettings`, but scoped to just
// `termsContent` — kept separate so the Terms editor doesn't need to resend
// pricing/iCal fields (and vice versa) just to save one of the two.
export const updateTermsContent = async (termsContent: string) => {
	const existing = await getSettings();
	if (existing) {
		const rows = await db
			.update(settings)
			.set({ termsContent })
			.where(eq(settings.id, existing.id))
			.returning();
		return rows[0]!;
	}
	const rows = await db.insert(settings).values({ termsContent }).returning();
	return rows[0]!;
};

export const getReservationById = async (id: number) => {
	const rows = await db
		.select()
		.from(reservations)
		.where(eq(reservations.id, id))
		.limit(1);
	return rows[0] ?? null;
};

export type NewReservation = {
	configurationId: number;
	checkIn: string;
	checkOut: string;
	guestName: string;
	guestEmail: string;
	guestPhone: string;
	guests: number;
	amountTotal: number;
};

// Detects the reservations_no_overlap EXCLUDE constraint violation. See
// lib/dbErrors.ts for how driver error shapes are walked.
export const isOverlapError = (e: unknown): boolean =>
	isExclusionViolation(e, "reservations_no_overlap");

// Lets a guest abandon their own still-pending hold (e.g. going back to change
// dates) so those dates free up immediately instead of waiting out the full
// hold window. Only ever transitions pending -> cancelled; already-confirmed
// reservations are left untouched by this WHERE clause.
export const cancelPendingReservation = async (
	id: number
): Promise<boolean> => {
	const rows = await db
		.update(reservations)
		.set({ status: "cancelled" })
		.where(and(eq(reservations.id, id), eq(reservations.status, "pending")))
		.returning({ id: reservations.id });
	return rows.length > 0;
};

// Admin-authority cancellation: unlike cancelPendingReservation above (guest-
// facing, pending-only), this also works on confirmed reservations — used by
// the double-booking reconciliation tool
// (netlify/functions/admin-cancel-reservation.mts). Does NOT touch Stripe;
// the caller issues a refund first when a payment was charged, before
// calling this, so a reservation is never freed without also being refunded.
export const adminCancelReservation = async (id: number) => {
	const rows = await db
		.update(reservations)
		.set({ status: "cancelled" })
		.where(
			and(
				eq(reservations.id, id),
				or(
					eq(reservations.status, "confirmed"),
					eq(reservations.status, "pending")
				)
			)
		)
		.returning();
	return rows[0] ?? null;
};

// Records the guest's uploaded photo ID (required before payment — see
// TermsStep.tsx). Gated on status = 'pending', same reasoning as
// cancelPendingReservation: a guest shouldn't be able to attach a new upload
// to a reservation that's already confirmed/expired/cancelled — including one
// that isn't theirs, since reservationId is the only credential this endpoint
// checks.
export const setReservationIdPhoto = async (
	id: number,
	blobKey: string
): Promise<boolean> => {
	const rows = await db
		.update(reservations)
		.set({ idPhotoBlobKey: blobKey })
		.where(and(eq(reservations.id, id), eq(reservations.status, "pending")))
		.returning({ id: reservations.id });
	return rows.length > 0;
};

// All reservations, newest check-in first — backs the admin Bookings tab.
export const listReservations = async () => {
	return db.select().from(reservations).orderBy(desc(reservations.checkIn));
};

export type ExternalBlockRow = {
	id: number;
	source: "airbnb" | "vrbo";
	checkIn: string;
	checkOut: string;
	summary: string | null;
	reservationUrl: string | null;
};

// Synced Airbnb/Vrbo blocks, newest check-in first — backs the admin Bookings
// tab's calendar (rendered alongside site reservations, tinted per source).
export const listExternalBlocks = async (): Promise<ExternalBlockRow[]> => {
	const rows = await db
		.select({
			id: externalBlocks.id,
			source: externalBlocks.source,
			checkIn: externalBlocks.checkIn,
			checkOut: externalBlocks.checkOut,
			summary: externalBlocks.summary,
			reservationUrl: externalBlocks.reservationUrl,
		})
		.from(externalBlocks)
		.orderBy(desc(externalBlocks.checkIn));
	return rows.map((r) => ({ ...r, source: r.source as "airbnb" | "vrbo" }));
};

export type GuestEmailSettingsUpdate = {
	checkInInstructions: string | null;
	checkOutInstructions: string | null;
	checkInReminderHour: number | null;
	checkOutReminderHour: number | null;
};

// Same single-row-upsert shape as `updateTermsContent`, scoped to the four
// guest-reminder-email fields (see netlify/functions/admin-guest-emails.mts) —
// kept separate so the Guest Emails admin tab doesn't need to resend the
// Terms/iCal/notification fields (and vice versa) just to save its own.
export const updateGuestEmailSettings = async (update: GuestEmailSettingsUpdate) => {
	const existing = await getSettings();
	if (existing) {
		const rows = await db
			.update(settings)
			.set(update)
			.where(eq(settings.id, existing.id))
			.returning();
		return rows[0]!;
	}
	const rows = await db.insert(settings).values(update).returning();
	return rows[0]!;
};

export type GuestEmailSchedulingCandidate = {
	id: number;
	guestName: string;
	guestEmail: string;
	checkIn: string;
	checkOut: string;
	checkInEmailId: string | null;
	checkOutEmailId: string | null;
};

// Confirmed reservations still missing at least one scheduled reminder — the
// working set for netlify/functions/schedule-guest-emails.mts's twice-monthly
// catch-all sweep (reservations booked further out than Resend's scheduling
// window allows at confirmation time — see stripe-webhook.mts and
// lib/mailer.ts). A reservation scheduled at booking-confirmation time never
// shows up here at all.
export const getReservationsNeedingGuestEmailScheduling = async (): Promise<
	GuestEmailSchedulingCandidate[]
> => {
	return db
		.select({
			id: reservations.id,
			guestName: reservations.guestName,
			guestEmail: reservations.guestEmail,
			checkIn: reservations.checkIn,
			checkOut: reservations.checkOut,
			checkInEmailId: reservations.checkInEmailId,
			checkOutEmailId: reservations.checkOutEmailId,
		})
		.from(reservations)
		.where(
			and(
				eq(reservations.status, "confirmed"),
				or(isNull(reservations.checkInEmailId), isNull(reservations.checkOutEmailId))
			)
		);
};

export const insertPendingReservation = async (r: NewReservation) => {
	const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
	const rows = await db
		.insert(reservations)
		.values({
			configurationId: r.configurationId,
			checkIn: r.checkIn,
			checkOut: r.checkOut,
			guestName: r.guestName,
			guestEmail: r.guestEmail,
			guestPhone: r.guestPhone,
			guests: r.guests,
			amountTotal: r.amountTotal,
			status: "pending",
			holdExpiresAt,
			// Minted upfront (not lazily on confirm) so it's always present by
			// the time stripe-webhook.mts reads it back — see
			// db/schema.ts's cancellationToken comment.
			cancellationToken: randomBytes(24).toString("hex"),
		})
		.returning({
			id: reservations.id,
			amountTotal: reservations.amountTotal,
			holdExpiresAt: reservations.holdExpiresAt,
		});
	return rows[0]!;
};
