import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { priceOverrides } from "../db/schema";
import { overlaps } from "./availability";
import { isExclusionViolation } from "./dbErrors";

export type PriceOverrideRow = typeof priceOverrides.$inferSelect;

export type PriceOverrideFields = {
	configurationId: number;
	checkIn: string;
	checkOut: string;
	nightlyRate: number;
	label: string | null;
};

// All overrides for one configuration, earliest check-in first — backs the
// admin Configurations tab's seasonal-pricing manager and check-availability's
// guest-facing override list. Scoped per-configuration (unlike blocking
// tables — see bookingConfigurations in db/schema.ts): "Whole Cabin" and
// "Downstairs Only" can each have their own holiday pricing for the same
// dates.
export const listPriceOverrides = async (
	configurationId: number
): Promise<Array<PriceOverrideRow>> =>
	db
		.select()
		.from(priceOverrides)
		.where(eq(priceOverrides.configurationId, configurationId))
		.orderBy(asc(priceOverrides.checkIn));

export const getPriceOverrideById = async (id: number): Promise<PriceOverrideRow | null> => {
	const rows = await db.select().from(priceOverrides).where(eq(priceOverrides.id, id)).limit(1);
	return rows[0] ?? null;
};

// Overrides for one configuration overlapping [checkIn, checkOut) — used by
// create-booking to price a stay authoritatively.
export const getPriceOverridesForRange = async (
	configurationId: number,
	checkIn: string,
	checkOut: string
): Promise<Array<PriceOverrideRow>> =>
	db
		.select()
		.from(priceOverrides)
		.where(
			and(eq(priceOverrides.configurationId, configurationId), overlaps(priceOverrides, checkIn, checkOut))
		);

export const createPriceOverride = async (fields: PriceOverrideFields): Promise<PriceOverrideRow> => {
	const rows = await db.insert(priceOverrides).values(fields).returning();
	return rows[0]!;
};

export const updatePriceOverride = async (
	id: number,
	fields: PriceOverrideFields
): Promise<PriceOverrideRow | null> => {
	const rows = await db
		.update(priceOverrides)
		.set(fields)
		.where(eq(priceOverrides.id, id))
		.returning();
	return rows[0] ?? null;
};

export const deletePriceOverride = async (id: number): Promise<PriceOverrideRow | null> => {
	const rows = await db.delete(priceOverrides).where(eq(priceOverrides.id, id)).returning();
	return rows[0] ?? null;
};

// Detects the price_overrides_no_overlap_per_configuration EXCLUDE constraint
// violation (scoped per-configuration — see db/schema.ts). See lib/dbErrors.ts
// for how driver error shapes are walked.
export const isPriceOverrideOverlapError = (e: unknown): boolean =>
	isExclusionViolation(e, "price_overrides_no_overlap_per_configuration");
