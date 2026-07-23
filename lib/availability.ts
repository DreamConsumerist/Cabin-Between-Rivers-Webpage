import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { externalBlocks, reservations, settings } from "../db/schema";
import { HOLD_MINUTES } from "./booking";

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
const overlaps = (
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

export const getSettings = async () => {
	const rows = await db.select().from(settings).limit(1);
	return rows[0] ?? null;
};

export type SettingsUpdate = {
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
	airbnbIcalUrl: string | null;
	vrboIcalUrl: string | null;
};

// The settings table is always a single row (see db/schema.ts) — update it if
// it exists, otherwise create it (e.g. before it's ever been seeded).
export const upsertSettings = async (update: SettingsUpdate) => {
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
	guestPhone?: string;
	guests: number;
	amountTotal: number;
};

// Postgres exclusion-violation error code — thrown when the EXCLUDE constraint
// rejects an overlapping reservation.
export const EXCLUSION_VIOLATION = "23P01";

const OVERLAP_CONSTRAINT = "reservations_no_overlap";

// Detects the overlap-constraint violation across every shape it can arrive in:
// node-postgres (local `netlify dev`) and Neon HTTP (production) expose `.code`
// and `.constraint` differently, and Drizzle may wrap the driver error in
// `.cause`. We walk the cause chain and also fall back to the message text.
export const isOverlapError = (e: unknown): boolean => {
	let current: unknown = e;
	for (let depth = 0; depth < 6 && current != null; depth++) {
		const err = current as {
			code?: unknown;
			constraint?: unknown;
			cause?: unknown;
		};
		if (err.code === EXCLUSION_VIOLATION) return true;
		if (err.constraint === OVERLAP_CONSTRAINT) return true;
		current = err.cause;
	}
	const message = e instanceof Error ? e.message : String(e);
	return message.includes(OVERLAP_CONSTRAINT) || /exclusion constraint/i.test(message);
};

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
