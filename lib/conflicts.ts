import { asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { doubleBookingConflicts } from "../db/schema";
import { notifyDoubleBooking, type DoubleBookingDetails } from "./mailer";

export type ConflictRow = typeof doubleBookingConflicts.$inferSelect;

export type FlagDoubleBookingInput = DoubleBookingDetails & { reservationId: number | null };

// Best-effort insert — catches and logs rather than throwing, mirroring
// notifyDoubleBooking's contract: a DB hiccup while recording a conflict must
// never mask the sync/webhook succeeding, or suppress the email.
export const recordConflict = async (input: FlagDoubleBookingInput): Promise<void> => {
	try {
		await db.insert(doubleBookingConflicts).values({
			source: input.source,
			checkIn: input.checkIn,
			checkOut: input.checkOut,
			detail: input.detail,
			reservationId: input.reservationId,
		});
	} catch (e) {
		console.error("recordConflict: failed to persist conflict row", e);
	}
};

// The single entry point lib/icalSync.ts and stripe-webhook.mts use in place
// of calling notifyDoubleBooking directly: persists the row (best-effort)
// AND sends the email (best-effort, via the existing notifyDoubleBooking).
// Never throws.
export const flagDoubleBooking = async (input: FlagDoubleBookingInput): Promise<void> => {
	await recordConflict(input);
	await notifyDoubleBooking(input);
};

export type ListConflictsFilter = { resolved?: boolean };

// resolved: false -> open conflicts, oldest first (longest-outstanding on
// top). resolved: true -> resolved conflicts, most-recently-resolved first.
// Omitted -> everything, newest-created first.
export const listConflicts = async ({ resolved }: ListConflictsFilter = {}): Promise<ConflictRow[]> => {
	if (resolved === false) {
		return db
			.select()
			.from(doubleBookingConflicts)
			.where(isNull(doubleBookingConflicts.resolvedAt))
			.orderBy(asc(doubleBookingConflicts.createdAt));
	}
	if (resolved === true) {
		return db
			.select()
			.from(doubleBookingConflicts)
			.where(isNotNull(doubleBookingConflicts.resolvedAt))
			.orderBy(desc(doubleBookingConflicts.resolvedAt));
	}
	return db.select().from(doubleBookingConflicts).orderBy(desc(doubleBookingConflicts.createdAt));
};

export const getConflictById = async (id: number): Promise<ConflictRow | null> => {
	const rows = await db.select().from(doubleBookingConflicts).where(eq(doubleBookingConflicts.id, id)).limit(1);
	return rows[0] ?? null;
};

// Marks resolved with an optional free-text note. No "already resolved"
// guard — an admin correcting a note later is a legitimate use, not an error.
export const resolveConflict = async (id: number, note: string | null): Promise<ConflictRow | null> => {
	const rows = await db
		.update(doubleBookingConflicts)
		.set({ resolvedAt: new Date(), resolutionNote: note })
		.where(eq(doubleBookingConflicts.id, id))
		.returning();
	return rows[0] ?? null;
};

// Re-opens a resolved conflict — so "mark resolved" isn't a one-way door.
export const reopenConflict = async (id: number): Promise<ConflictRow | null> => {
	const rows = await db
		.update(doubleBookingConflicts)
		.set({ resolvedAt: null, resolutionNote: null })
		.where(eq(doubleBookingConflicts.id, id))
		.returning();
	return rows[0] ?? null;
};
