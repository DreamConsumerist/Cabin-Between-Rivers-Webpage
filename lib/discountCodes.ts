import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { discountCodes, reservations, type DiscountType } from "../db/schema";
import { isForeignKeyViolation } from "./dbErrors";

export type DiscountCodeRow = typeof discountCodes.$inferSelect;

export type DiscountCodeFields = {
	code: string;
	discountType: DiscountType;
	discountValue: number;
};

// Codes are matched case-insensitively without a citext column — normalize
// once here, on both write and read paths, instead of at every call site.
const normalizeCode = (code: string): string => code.trim().toUpperCase();

export const listDiscountCodes = async (): Promise<Array<DiscountCodeRow>> =>
	db.select().from(discountCodes).orderBy(asc(discountCodes.createdAt));

// Guest-facing lookup for apply-discount-code.mts — only ever matches a code
// an admin has left active.
export const getActiveDiscountCodeByCode = async (
	code: string
): Promise<DiscountCodeRow | null> => {
	const rows = await db
		.select()
		.from(discountCodes)
		.where(eq(discountCodes.code, normalizeCode(code)))
		.limit(1);
	const row = rows[0];
	return row && row.active ? row : null;
};

export const createDiscountCode = async (
	fields: DiscountCodeFields
): Promise<DiscountCodeRow> => {
	const rows = await db
		.insert(discountCodes)
		.values({ ...fields, code: normalizeCode(fields.code) })
		.returning();
	return rows[0]!;
};

export type DeleteDiscountCodeResult = { ok: true } | { ok: false; reason: "in-use" };

// Refuses to delete a code still referenced by a reservation (see
// reservations.discountCodeId's NO ACTION comment in db/schema.ts) — a
// reservation's own record of what was applied to it must survive the code
// being retired.
export const deleteDiscountCode = async (id: number): Promise<DeleteDiscountCodeResult> => {
	try {
		const rows = await db.delete(discountCodes).where(eq(discountCodes.id, id)).returning();
		if (!rows[0]) return { ok: false, reason: "in-use" };
		return { ok: true };
	} catch (e) {
		if (isForeignKeyViolation(e)) return { ok: false, reason: "in-use" };
		throw e;
	}
};

// Cents to take off a `baseAmountCents` total for one discount code. Clamped
// so a flat (or, pathologically, an over-100% percent) discount never makes
// the charge negative.
export const computeDiscountCents = (
	baseAmountCents: number,
	discountType: DiscountType,
	discountValue: number
): number => {
	const raw =
		discountType === "percent"
			? Math.round((baseAmountCents * discountValue) / 100)
			: discountValue;
	return Math.max(0, Math.min(raw, baseAmountCents));
};

export type ApplyDiscountResult =
	| { ok: true; reservation: typeof reservations.$inferSelect; appliedCode: string | null }
	| { ok: false; reason: "not-found" | "invalid-code" };

// Applies (code present) or clears (code null/empty) a discount code against a
// still-pending reservation, recomputing amountTotal from scratch each time —
// `amountTotal + discountAmount` on the current row is always the
// pre-discount total (see db/schema.ts's discountAmount comment), so changing
// or removing a code never compounds on top of a previous discount. Callers
// (apply-discount-code.mts) are responsible for checking the reservation is
// still pending/unexpired before calling this.
export const applyDiscountCode = async (
	reservationId: number,
	code: string | null
): Promise<ApplyDiscountResult> => {
	const rows = await db
		.select()
		.from(reservations)
		.where(eq(reservations.id, reservationId))
		.limit(1);
	const reservation = rows[0];
	if (!reservation) return { ok: false, reason: "not-found" };

	const baseAmountCents = reservation.amountTotal + reservation.discountAmount;
	const trimmedCode = code?.trim() ?? "";

	if (trimmedCode.length === 0) {
		const updated = await db
			.update(reservations)
			.set({ discountCodeId: null, discountAmount: 0, amountTotal: baseAmountCents })
			.where(eq(reservations.id, reservationId))
			.returning();
		return { ok: true, reservation: updated[0]!, appliedCode: null };
	}

	const discountCode = await getActiveDiscountCodeByCode(trimmedCode);
	if (!discountCode) return { ok: false, reason: "invalid-code" };

	const discountAmount = computeDiscountCents(
		baseAmountCents,
		discountCode.discountType,
		discountCode.discountValue
	);
	const updated = await db
		.update(reservations)
		.set({
			discountCodeId: discountCode.id,
			discountAmount,
			amountTotal: baseAmountCents - discountAmount,
		})
		.where(eq(reservations.id, reservationId))
		.returning();
	return { ok: true, reservation: updated[0]!, appliedCode: discountCode.code };
};
