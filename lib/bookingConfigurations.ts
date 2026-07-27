import { asc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { bookingConfigurations } from "../db/schema";
import { isForeignKeyViolation } from "./dbErrors";

export type BookingConfigurationRow = typeof bookingConfigurations.$inferSelect;

export type BookingConfigurationFields = {
	name: string;
	description: string | null;
	nightlyRate: number;
	cleaningFee: number;
	minNights: number;
	baseOccupancy: number;
	extraGuestFee: number;
	isDefault: boolean;
};

// All configurations (e.g. "Whole Cabin", "Downstairs Only"), in admin list
// order — backs the admin Configurations tab and the guest-facing
// configuration-picker step.
export const listConfigurations = async (): Promise<Array<BookingConfigurationRow>> =>
	db
		.select()
		.from(bookingConfigurations)
		.orderBy(asc(bookingConfigurations.position), asc(bookingConfigurations.id));

export const getConfigurationById = async (
	id: number
): Promise<BookingConfigurationRow | null> => {
	const rows = await db
		.select()
		.from(bookingConfigurations)
		.where(eq(bookingConfigurations.id, id))
		.limit(1);
	return rows[0] ?? null;
};

export const getDefaultConfiguration = async (): Promise<BookingConfigurationRow | null> => {
	const rows = await db
		.select()
		.from(bookingConfigurations)
		.where(eq(bookingConfigurations.isDefault, true))
		.limit(1);
	return rows[0] ?? null;
};

// Resolves which configuration a guest-facing request is pricing/booking
// against: the one explicitly requested, or the default when switching is
// off / no id was sent. Returns null if an explicit id doesn't exist (the
// caller should 400 rather than silently falling back — an unknown id is
// almost certainly a stale client, not "no preference").
export const resolveConfiguration = async (
	configurationId?: number | null
): Promise<BookingConfigurationRow | null> => {
	if (configurationId == null) return getDefaultConfiguration();
	return getConfigurationById(configurationId);
};

// Only one row is ever the default (used whenever settings.
// configurationSwitchingEnabled is false or a guest hasn't picked one), so
// creating/updating a row with isDefault: true unsets every other row's flag
// in the same transaction. New rows are appended to the end of the admin
// list order (max position + 1), same convention as lib/gallery.ts.
export const createConfiguration = async (
	fields: BookingConfigurationFields
): Promise<BookingConfigurationRow> => {
	return db.transaction(async (tx) => {
		if (fields.isDefault) {
			await tx.update(bookingConfigurations).set({ isDefault: false });
		}
		const rows = await tx
			.insert(bookingConfigurations)
			.values({
				...fields,
				position: sql`(select coalesce(max(${bookingConfigurations.position}), -1) + 1 from ${bookingConfigurations})`,
			})
			.returning();
		return rows[0]!;
	});
};

export const updateConfiguration = async (
	id: number,
	fields: BookingConfigurationFields
): Promise<BookingConfigurationRow | null> => {
	return db.transaction(async (tx) => {
		if (fields.isDefault) {
			await tx
				.update(bookingConfigurations)
				.set({ isDefault: false })
				.where(ne(bookingConfigurations.id, id));
		}
		const rows = await tx
			.update(bookingConfigurations)
			.set(fields)
			.where(eq(bookingConfigurations.id, id))
			.returning();
		return rows[0] ?? null;
	});
};

export type DeleteConfigurationResult =
	| { ok: true; deleted: BookingConfigurationRow }
	| { ok: false; reason: "is-default" | "in-use" };

// Refuses to delete the default configuration outright (there must always be
// one to fall back to), and relies on the reservations/price_overrides FK
// (NO ACTION) to reject deleting a configuration that's still referenced,
// translating that into a friendly result instead of a raw DB error.
export const deleteConfiguration = async (
	id: number
): Promise<DeleteConfigurationResult> => {
	const existing = await getConfigurationById(id);
	if (existing?.isDefault) return { ok: false, reason: "is-default" };

	try {
		const rows = await db
			.delete(bookingConfigurations)
			.where(eq(bookingConfigurations.id, id))
			.returning();
		if (!rows[0]) return { ok: false, reason: "in-use" };
		return { ok: true, deleted: rows[0] };
	} catch (e) {
		if (isForeignKeyViolation(e)) return { ok: false, reason: "in-use" };
		throw e;
	}
};
