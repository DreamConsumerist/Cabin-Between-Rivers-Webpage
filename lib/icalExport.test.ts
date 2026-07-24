import { describe, expect, it } from "vitest";
import { buildReservationsIcs } from "./icalExport";

// Unlike lib/icalSync.test.ts, no vi.mock("../db/client") is needed —
// buildReservationsIcs is pure and takes plain reservation rows, with no
// transitive DB import.

const FIXED_NOW = new Date("2026-07-23T12:00:00.000Z");

describe("buildReservationsIcs", () => {
	it("wraps output in a valid VCALENDAR structure", () => {
		const ics = buildReservationsIcs([], FIXED_NOW);
		expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
		expect(ics).toContain("VERSION:2.0\r\n");
		expect(ics).toContain("PRODID:");
		expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
	});

	it("produces a structurally valid, empty calendar for no reservations", () => {
		const ics = buildReservationsIcs([], FIXED_NOW);
		expect(ics).not.toContain("BEGIN:VEVENT");
	});

	it("emits one VEVENT per reservation with DTSTART/DTEND matching checkIn/checkOut exactly", () => {
		const ics = buildReservationsIcs(
			[{ id: 42, checkIn: "2026-08-01", checkOut: "2026-08-05" }],
			FIXED_NOW
		);

		expect(ics).toContain("BEGIN:VEVENT");
		expect(ics).toContain("DTSTART;VALUE=DATE:20260801");
		// No +1-day adjustment going this direction (opposite of the import
		// side's addOneDay) — export always has an explicit checkOut.
		expect(ics).toContain("DTEND;VALUE=DATE:20260805");
		expect(ics).toContain("END:VEVENT");
	});

	it("derives a stable UID from the reservation id, identical across separate calls", () => {
		const reservation = {
			id: 7,
			checkIn: "2026-09-01",
			checkOut: "2026-09-03",
		};
		const first = buildReservationsIcs([reservation], FIXED_NOW);
		const second = buildReservationsIcs(
			[reservation],
			new Date("2026-07-24T00:00:00.000Z")
		);

		const uidLine = (ics: string): string | undefined =>
			ics.split("\r\n").find((line) => line.startsWith("UID:"));
		expect(uidLine(first)).toBe(uidLine(second));
		expect(uidLine(first)).toContain("reservation-7@");
	});

	it("never includes anything beyond id/checkIn/checkOut — no guest PII", () => {
		const ics = buildReservationsIcs(
			[{ id: 1, checkIn: "2026-10-01", checkOut: "2026-10-02" }],
			FIXED_NOW
		);
		expect(ics).not.toMatch(/@(?!cabinbetweenrivers)/); // only the fixed UID domain's "@" should appear
		expect(ics).toContain("SUMMARY:Cabin Between Rivers");
	});

	it("uses CRLF line endings throughout", () => {
		const ics = buildReservationsIcs(
			[{ id: 1, checkIn: "2026-10-01", checkOut: "2026-10-02" }],
			FIXED_NOW
		);
		expect(ics).not.toMatch(/(?<!\r)\n/);
	});

	it("keeps every emitted line at or under the RFC 5545 75-octet fold limit", () => {
		const ics = buildReservationsIcs(
			[{ id: 123456789, checkIn: "2026-10-01", checkOut: "2026-10-02" }],
			FIXED_NOW
		);
		for (const line of ics.split("\r\n")) {
			expect(line.length).toBeLessThanOrEqual(75);
		}
	});
});
