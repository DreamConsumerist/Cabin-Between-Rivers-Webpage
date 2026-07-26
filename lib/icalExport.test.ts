import { describe, expect, it } from "vitest";
import { buildBlocksIcs } from "./icalExport";

// Unlike lib/icalSync.test.ts, no vi.mock("../db/client") is needed —
// buildBlocksIcs is pure and takes plain rows, with no transitive DB import.

const FIXED_NOW = new Date("2026-07-23T12:00:00.000Z");

describe("buildBlocksIcs", () => {
	it("wraps output in a valid VCALENDAR structure", () => {
		const ics = buildBlocksIcs([], FIXED_NOW);
		expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
		expect(ics).toContain("VERSION:2.0\r\n");
		expect(ics).toContain("PRODID:");
		expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
	});

	it("produces a structurally valid, empty calendar for no blocks", () => {
		const ics = buildBlocksIcs([], FIXED_NOW);
		expect(ics).not.toContain("BEGIN:VEVENT");
	});

	it("emits one VEVENT per reservation with DTSTART/DTEND matching checkIn/checkOut exactly", () => {
		const ics = buildBlocksIcs(
			[{ id: 42, checkIn: "2026-08-01", checkOut: "2026-08-05", source: "reservation" }],
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
			source: "reservation" as const,
		};
		const first = buildBlocksIcs([reservation], FIXED_NOW);
		const second = buildBlocksIcs([reservation], new Date("2026-07-24T00:00:00.000Z"));

		const uidLine = (ics: string): string | undefined =>
			ics.split("\r\n").find((line) => line.startsWith("UID:"));
		expect(uidLine(first)).toBe(uidLine(second));
		expect(uidLine(first)).toContain("reservation-7@");
	});

	it("never includes anything beyond id/checkIn/checkOut — no guest PII", () => {
		const ics = buildBlocksIcs(
			[{ id: 1, checkIn: "2026-10-01", checkOut: "2026-10-02", source: "reservation" }],
			FIXED_NOW
		);
		expect(ics).not.toMatch(/@(?!cabinbetweenrivers)/); // only the fixed UID domain's "@" should appear
		expect(ics).toContain("SUMMARY:Cabin Between Rivers");
	});

	it("uses CRLF line endings throughout", () => {
		const ics = buildBlocksIcs(
			[{ id: 1, checkIn: "2026-10-01", checkOut: "2026-10-02", source: "reservation" }],
			FIXED_NOW
		);
		expect(ics).not.toMatch(/(?<!\r)\n/);
	});

	it("keeps every emitted line at or under the RFC 5545 75-octet fold limit", () => {
		const ics = buildBlocksIcs(
			[{ id: 123456789, checkIn: "2026-10-01", checkOut: "2026-10-02", source: "reservation" }],
			FIXED_NOW
		);
		for (const line of ics.split("\r\n")) {
			expect(line.length).toBeLessThanOrEqual(75);
		}
	});

	it("emits manual blocks under a distinct UID namespace from reservations, even with the same id", () => {
		const ics = buildBlocksIcs(
			[
				{ id: 3, checkIn: "2026-08-01", checkOut: "2026-08-03", source: "reservation" },
				{ id: 3, checkIn: "2026-09-01", checkOut: "2026-09-03", source: "manual" },
			],
			FIXED_NOW
		);

		const uidLines = ics.split("\r\n").filter((line) => line.startsWith("UID:"));
		expect(uidLines).toContain(`UID:reservation-3@cabinbetweenrivers.com`);
		expect(uidLines).toContain(`UID:manual-block-3@cabinbetweenrivers.com`);
	});

	it("labels manual blocks as blocked rather than booked, without leaking the admin's note", () => {
		const ics = buildBlocksIcs(
			[{ id: 5, checkIn: "2026-11-01", checkOut: "2026-11-02", source: "manual" }],
			FIXED_NOW
		);
		expect(ics).toContain("SUMMARY:Cabin Between Rivers — Blocked");
	});
});
