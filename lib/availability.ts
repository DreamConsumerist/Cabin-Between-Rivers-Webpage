import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { externalBlocks, reservations, settings } from "../db/schema";
import { HOLD_MINUTES } from "./booking";
import { isExclusionViolation } from "./dbErrors";

export type BlockedRange = {
	checkIn: string;
	checkOut: string;
	source: "reservation" | "airbnb" | "vrbo";
};

// A reservation blocks dates when it is confirmed, or pending with a hold that
// hasn't lapsed yet. (Lapsed pending holds are treated as free.)
const activeReservation = () =>
	or(
		eq(reservations.status, "confirmed"),
		and(eq(reservations.status, "pending"), gt(reservations.holdExpiresAt, sql`now()`))
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

// All currently-blocked date ranges (active reservations + external blocks),
// for rendering the availability calendar.
export const getBlockedRanges = async (): Promise<BlockedRange[]> => {
	const [res, ext] = await Promise.all([
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
	]);

	return [
		...res.map((r) => ({ ...r, source: "reservation" as const })),
		...ext.map((e) => ({
			checkIn: e.checkIn,
			checkOut: e.checkOut,
			source: e.source as "airbnb" | "vrbo",
		})),
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

export type ActiveReservationOverlap = { id: number; checkIn: string; checkOut: string };

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

export type PricingUpdate = {
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
};

// The settings table is always a single row (see db/schema.ts) — update it if
// it exists, otherwise create it (e.g. before it's ever been seeded). Scoped
// to just the pricing fields — see updateIcalUrls/updateTermsContent for the
// same single-row-upsert shape scoped to their own fields, so the Pricing,
// iCal, and Terms admin tabs never resend each other's fields just to save
// their own.
export const updatePricingSettings = async (update: PricingUpdate) => {
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
	notificationEmails: string | null;
};

// Same single-row-upsert shape as `updatePricingSettings`, but scoped to just
// the Airbnb/Vrbo iCal URLs and the double-booking notification recipients
// (see lib/mailer.ts) — they're saved together from the same admin iCal tab.
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
export const cancelPendingReservation = async (id: number): Promise<boolean> => {
	const rows = await db
		.update(reservations)
		.set({ status: "cancelled" })
		.where(and(eq(reservations.id, id), eq(reservations.status, "pending")))
		.returning({ id: reservations.id });
	return rows.length > 0;
};

// Records the guest's uploaded photo ID (required before payment — see
// TermsStep.tsx). Gated on status = 'pending', same reasoning as
// cancelPendingReservation: a guest shouldn't be able to attach a new upload
// to a reservation that's already confirmed/expired/cancelled — including one
// that isn't theirs, since reservationId is the only credential this endpoint
// checks.
export const setReservationIdPhoto = async (id: number, blobKey: string): Promise<boolean> => {
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

export const insertPendingReservation = async (r: NewReservation) => {
	const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
	const rows = await db
		.insert(reservations)
		.values({
			checkIn: r.checkIn,
			checkOut: r.checkOut,
			guestName: r.guestName,
			guestEmail: r.guestEmail,
			guestPhone: r.guestPhone,
			guests: r.guests,
			amountTotal: r.amountTotal,
			status: "pending",
			holdExpiresAt,
		})
		.returning({
			id: reservations.id,
			amountTotal: reservations.amountTotal,
			holdExpiresAt: reservations.holdExpiresAt,
		});
	return rows[0]!;
};
