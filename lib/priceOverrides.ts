import { and, asc, eq, gte, isNull, ne, or } from "drizzle-orm";
import dayjs from "dayjs";
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

const todayIsoDate = (): string => dayjs().format("YYYY-MM-DD");

// Pure date-math for generating a recurring series' next instance — no `db`
// dependency, so it's unit-testable without mocking the database.
export const shiftYears = (
	checkIn: string,
	checkOut: string,
	years: number
): { checkIn: string; checkOut: string } => ({
	checkIn: dayjs(checkIn).add(years, "year").format("YYYY-MM-DD"),
	checkOut: dayjs(checkOut).add(years, "year").format("YYYY-MM-DD"),
});

// All overrides for one configuration, earliest check-in first — backs
// check-availability's guest-facing override list, which genuinely needs
// every future instance of a recurring series (a guest browsing a date two
// years out still needs that year's clone to price correctly). Scoped
// per-configuration (unlike blocking tables — see bookingConfigurations in
// db/schema.ts): "Whole Cabin" and "Downstairs Only" can each have their own
// holiday pricing for the same dates. For the admin-facing list, see
// listPriceOverridesForAdmin below instead.
export const listPriceOverrides = async (
	configurationId: number
): Promise<Array<PriceOverrideRow>> =>
	db
		.select()
		.from(priceOverrides)
		.where(eq(priceOverrides.configurationId, configurationId))
		.orderBy(asc(priceOverrides.checkIn));

// Of one recurring series' instances, the one to show as "the" row for that
// series: whichever instance is active today, or failing that the soonest
// upcoming one, or — only if every instance has already lapsed, which
// shouldn't happen for a series the annual cron is still extending — the
// most recent past one, so a series never vanishes from the list outright.
const pickCurrentInstance = (
	instances: Array<PriceOverrideRow>
): PriceOverrideRow => {
	const today = todayIsoDate();
	const active = instances.find((row) => row.checkIn <= today && today < row.checkOut);
	if (active) return active;

	const upcoming = instances
		.filter((row) => row.checkIn >= today)
		.sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1))[0];
	if (upcoming) return upcoming;

	return instances.reduce((latest, row) => (row.checkIn > latest.checkIn ? row : latest));
};

// Admin-facing counterpart to listPriceOverrides: one-off overrides pass
// through unchanged, but a recurring series collapses down to just its
// current/next-upcoming instance instead of listing every auto-generated
// future year (the seasonal-pricing panel would otherwise fill up with e.g.
// 2026, 2027, 2028, 2029 rows for what is, from the admin's point of view,
// one rule). Editing or deleting whichever instance is shown still acts on
// the whole series — updatePriceOverrideAndPropagate/endRecurringSeries
// resolve the series from any one of its rows — so collapsing the list here
// doesn't change what an edit/delete affects, only what's displayed.
export const listPriceOverridesForAdmin = async (
	configurationId: number
): Promise<Array<PriceOverrideRow>> => {
	const rows = await listPriceOverrides(configurationId);

	const seriesInstances = new Map<number, Array<PriceOverrideRow>>();
	const oneOff: Array<PriceOverrideRow> = [];
	for (const row of rows) {
		if (!row.recurring) {
			oneOff.push(row);
			continue;
		}
		const rootId = row.seriesParentId ?? row.id;
		const group = seriesInstances.get(rootId);
		if (group) group.push(row);
		else seriesInstances.set(rootId, [row]);
	}

	const collapsed = [
		...oneOff,
		...Array.from(seriesInstances.values(), pickCurrentInstance),
	];
	return collapsed.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
};

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

// Creates a recurring series: the root row the admin asked for, plus best-
// effort copies at +1 and +2 years so the series has visible coverage
// immediately instead of waiting for the next Jan 1
// extend-recurring-price-overrides run. Both years are generated explicitly
// (not just +2) — extendRecurringSeries only ever extends forward from
// whatever the latest existing instance already is, so if +1 were skipped
// here, no later cron run would ever go back and fill it in; the gap would
// be permanent, not just until the next Jan 1.
// Each insert is deliberately NOT wrapped in the same transaction as the root
// (or as each other) — if one collides with an unrelated override already on
// the books (isPriceOverrideOverlapError) we skip just that year rather than
// fail the root creation the admin is actually waiting on; a Postgres
// transaction can't recover from a failed statement without a savepoint,
// which nothing else in this codebase uses.
export const createRecurringPriceOverride = async (
	fields: PriceOverrideFields
): Promise<PriceOverrideRow> => {
	const rootRows = await db
		.insert(priceOverrides)
		.values({ ...fields, recurring: true })
		.returning();
	const root = rootRows[0]!;

	for (const years of [1, 2]) {
		const shifted = shiftYears(fields.checkIn, fields.checkOut, years);
		try {
			await db.insert(priceOverrides).values({
				configurationId: fields.configurationId,
				checkIn: shifted.checkIn,
				checkOut: shifted.checkOut,
				nightlyRate: fields.nightlyRate,
				label: fields.label,
				recurring: true,
				seriesParentId: root.id,
			});
		} catch (e) {
			if (!isPriceOverrideOverlapError(e)) throw e;
			console.error(
				`createRecurringPriceOverride: series ${root.id}'s +${years}-year instance (${shifted.checkIn}) overlaps an existing override, skipping`
			);
		}
	}

	return root;
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

// Updates one instance of a recurring series, then propagates just the
// nightlyRate/label to every other current-and-future instance in the same
// series (checkIn >= today) — past instances are left alone, and each
// instance's own dates are never touched by another instance's edit. Every
// row in a series is found via `id = rootId OR seriesParentId = rootId`,
// where rootId is the edited row's seriesParentId (a child) or its own id
// (the root itself).
export const updatePriceOverrideAndPropagate = async (
	id: number,
	fields: PriceOverrideFields
): Promise<PriceOverrideRow | null> =>
	db.transaction(async (tx) => {
		const rows = await tx.update(priceOverrides).set(fields).where(eq(priceOverrides.id, id)).returning();
		const updated = rows[0];
		if (!updated || !updated.recurring) return updated ?? null;

		const rootId = updated.seriesParentId ?? updated.id;
		await tx
			.update(priceOverrides)
			.set({ nightlyRate: fields.nightlyRate, label: fields.label })
			.where(
				and(
					or(eq(priceOverrides.id, rootId), eq(priceOverrides.seriesParentId, rootId)),
					ne(priceOverrides.id, updated.id),
					gte(priceOverrides.checkIn, todayIsoDate())
				)
			);

		return updated;
	});

export const deletePriceOverride = async (id: number): Promise<PriceOverrideRow | null> => {
	const rows = await db.delete(priceOverrides).where(eq(priceOverrides.id, id)).returning();
	return rows[0] ?? null;
};

// Ends a recurring series: removes the clicked instance plus every other
// current-and-future instance in the series (children before the root, to
// satisfy the seriesParentId FK), then flips `recurring` off on whatever's
// left (past instances) so extendRecurringSeries stops treating the series
// as active — otherwise a leftover past root row would look like a
// never-extended series and get resurrected on the next Jan 1 run.
export const endRecurringSeries = async (id: number): Promise<PriceOverrideRow | null> => {
	const existing = await getPriceOverrideById(id);
	if (!existing) return null;

	const rootId = existing.seriesParentId ?? existing.id;
	const today = todayIsoDate();
	const futureOrClicked = or(gte(priceOverrides.checkIn, today), eq(priceOverrides.id, id));

	await db.transaction(async (tx) => {
		await tx.delete(priceOverrides).where(and(eq(priceOverrides.seriesParentId, rootId), futureOrClicked));
		await tx.delete(priceOverrides).where(and(eq(priceOverrides.id, rootId), futureOrClicked));
		await tx
			.update(priceOverrides)
			.set({ recurring: false })
			.where(or(eq(priceOverrides.id, rootId), eq(priceOverrides.seriesParentId, rootId)));
	});

	return existing;
};

// Detects the price_overrides_no_overlap_per_configuration EXCLUDE constraint
// violation (scoped per-configuration — see db/schema.ts). See lib/dbErrors.ts
// for how driver error shapes are walked.
export const isPriceOverrideOverlapError = (e: unknown): boolean =>
	isExclusionViolation(e, "price_overrides_no_overlap_per_configuration");

// The Jan 1 scheduled job (netlify/functions/extend-recurring-price-
// overrides.mts): for every active recurring series, rolls its coverage
// forward so the furthest instance is never less than 2 years ahead of today.
// Generates from the series' latest existing instance (not its root), so a
// rate edited via updatePriceOverrideAndPropagate — which only reaches
// existing checkIn >= today rows — still carries forward into rows that
// don't exist yet at edit time. A blocked series (its next date collides
// with an unrelated override) is skipped with a logged error rather than
// aborting the whole run.
export const extendRecurringSeries = async (): Promise<void> => {
	const roots = await db
		.select()
		.from(priceOverrides)
		.where(and(eq(priceOverrides.recurring, true), isNull(priceOverrides.seriesParentId)));

	const targetYear = dayjs().year() + 2;
	const MAX_CATCH_UP_YEARS = 5;

	for (const root of roots) {
		const siblings = await db
			.select()
			.from(priceOverrides)
			.where(and(eq(priceOverrides.recurring, true), eq(priceOverrides.seriesParentId, root.id)));

		let latest = [root, ...siblings].reduce((a, b) => (dayjs(b.checkIn).isAfter(a.checkIn) ? b : a));

		for (let i = 0; i < MAX_CATCH_UP_YEARS && dayjs(latest.checkIn).year() < targetYear; i++) {
			const shifted = shiftYears(latest.checkIn, latest.checkOut, 1);
			try {
				const created = await db
					.insert(priceOverrides)
					.values({
						configurationId: root.configurationId,
						checkIn: shifted.checkIn,
						checkOut: shifted.checkOut,
						nightlyRate: latest.nightlyRate,
						label: latest.label,
						recurring: true,
						seriesParentId: root.id,
					})
					.returning();
				latest = created[0]!;
			} catch (e) {
				if (!isPriceOverrideOverlapError(e)) throw e;
				console.error(
					`extendRecurringSeries: series ${root.id}'s next instance (${shifted.checkIn}) overlaps an existing override, skipping series`
				);
				break;
			}
		}
	}
};
