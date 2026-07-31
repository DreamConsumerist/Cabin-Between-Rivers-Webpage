import { describe, expect, it, vi } from "vitest";
import dayjs from "dayjs";

// lib/priceOverrides.ts imports ../db/client, which throws at module load if
// NETLIFY_DB_URL isn't set (it constructs the Drizzle client eagerly) — same
// mock approach as lib/icalSync.test.ts.
vi.mock("../db/client", () => ({ db: {} }));

const { shiftYears, collapsePriceOverridesForAdmin, RECURRING_SERIES_HORIZON_YEARS } =
	await import("./priceOverrides");

describe("shiftYears", () => {
	it("shifts both checkIn and checkOut by the given number of years", () => {
		expect(shiftYears("2026-08-05", "2026-08-08", 2)).toEqual({
			checkIn: "2028-08-05",
			checkOut: "2028-08-08",
		});
	});

	it("preserves a stay that crosses a year boundary", () => {
		expect(shiftYears("2026-12-28", "2027-01-04", 1)).toEqual({
			checkIn: "2027-12-28",
			checkOut: "2028-01-04",
		});
	});

	it("rolls a Feb 29 checkIn onto Feb 28 in a non-leap target year", () => {
		expect(shiftYears("2028-02-29", "2028-03-02", 1)).toEqual({
			checkIn: "2029-02-28",
			checkOut: "2029-03-02",
		});
	});
});

describe("RECURRING_SERIES_HORIZON_YEARS", () => {
	it("is 10 — the 'early buy-in' horizon a series' instances are kept materialized for", () => {
		expect(RECURRING_SERIES_HORIZON_YEARS).toBe(10);
	});
});

type Row = { id: number; checkIn: string; checkOut: string; recurring: boolean; seriesParentId: number | null };

const row = (fields: Partial<Row> & { id: number; checkIn: string }): Row => ({
	checkOut: dayjs(fields.checkIn).add(3, "day").format("YYYY-MM-DD"),
	recurring: false,
	seriesParentId: null,
	...fields,
});

describe("collapsePriceOverridesForAdmin", () => {
	it("passes one-off (non-recurring) overrides through unchanged", () => {
		const rows = [row({ id: 1, checkIn: "2026-08-05", recurring: false })];
		expect(collapsePriceOverridesForAdmin(rows as never)).toEqual(rows);
	});

	it("collapses every future instance of a recurring series down to just the soonest upcoming one", () => {
		// Regression test: before collapsePriceOverridesForAdmin existed as its
		// own export, this collapsing ran unconditionally in
		// listPriceOverridesForAdmin and fed straight into the admin calendar,
		// which meant a series' 2027/2028 instances vanished as soon as an admin
		// paged the calendar forward — the caller now decides per-use-case
		// whether it wants the collapsed view (the editable list) or every row
		// (the calendar).
		const root = row({ id: 1, checkIn: "2026-10-07", recurring: true });
		const plusOne = row({ id: 2, checkIn: "2027-10-07", recurring: true, seriesParentId: 1 });
		const plusTwo = row({ id: 3, checkIn: "2028-10-07", recurring: true, seriesParentId: 1 });

		const collapsed = collapsePriceOverridesForAdmin([root, plusOne, plusTwo] as never);

		expect(collapsed).toHaveLength(1);
		expect((collapsed[0] as Row).id).toBe(1);
	});

	it("picks the currently-active instance over a later upcoming one when today falls inside its range", () => {
		const past = row({ id: 1, checkIn: dayjs().subtract(1, "day").format("YYYY-MM-DD"), recurring: true });
		const future = row({
			id: 2,
			checkIn: dayjs().add(1, "year").format("YYYY-MM-DD"),
			recurring: true,
			seriesParentId: 1,
		});

		const collapsed = collapsePriceOverridesForAdmin([past, future] as never);

		expect(collapsed).toHaveLength(1);
		expect((collapsed[0] as Row).id).toBe(1);
	});
});
