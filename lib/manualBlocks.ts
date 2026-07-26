import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { manualBlocks } from "../db/schema";
import { overlaps } from "./availability";
import { isExclusionViolation } from "./dbErrors";

export type ManualBlockRow = typeof manualBlocks.$inferSelect;

export type ManualBlockFields = {
	checkIn: string;
	checkOut: string;
	note: string | null;
};

// All manual blocks, newest check-in first — backs the admin Bookings tab's
// calendar and the manual-blocks manager list.
export const listManualBlocks = async (): Promise<Array<ManualBlockRow>> =>
	db.select().from(manualBlocks).orderBy(desc(manualBlocks.checkIn));

// True if [checkIn, checkOut) overlaps an existing manual block — used by
// create-booking alongside hasExternalBlockOverlap so a guest can't book over
// dates an admin has manually closed off.
export const hasManualBlockOverlap = async (checkIn: string, checkOut: string): Promise<boolean> => {
	const rows = await db
		.select({ id: manualBlocks.id })
		.from(manualBlocks)
		.where(overlaps(manualBlocks, checkIn, checkOut))
		.limit(1);
	return rows.length > 0;
};

export const createManualBlock = async (fields: ManualBlockFields): Promise<ManualBlockRow> => {
	const rows = await db.insert(manualBlocks).values(fields).returning();
	return rows[0]!;
};

export const deleteManualBlock = async (id: number): Promise<ManualBlockRow | null> => {
	const rows = await db.delete(manualBlocks).where(eq(manualBlocks.id, id)).returning();
	return rows[0] ?? null;
};

// Detects the manual_blocks_no_overlap EXCLUDE constraint violation. See
// lib/dbErrors.ts for how driver error shapes are walked.
export const isManualBlockOverlapError = (e: unknown): boolean =>
	isExclusionViolation(e, "manual_blocks_no_overlap");
