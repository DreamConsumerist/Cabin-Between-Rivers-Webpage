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
