import { describe, expect, it, vi } from "vitest";

// lib/priceOverrides.ts imports ../db/client, which throws at module load if
// NETLIFY_DB_URL isn't set (it constructs the Drizzle client eagerly) — same
// mock approach as lib/icalSync.test.ts.
vi.mock("../db/client", () => ({ db: {} }));

const { shiftYears } = await import("./priceOverrides");

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
