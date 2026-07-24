import { describe, expect, it, vi } from "vitest";

// lib/icalSync.ts imports ../db/client, which throws at module load if
// NETLIFY_DB_URL isn't set (it constructs the Drizzle client eagerly). Mock
// it so importing parseIcsText/diffBlocks doesn't need a real database — see
// db/client.ts. Vitest resolves this mock by absolute path, so it also
// covers icalSync.ts's transitive imports of ./availability and ./mailer.
vi.mock("../db/client", () => ({ db: {} }));

const { diffBlocks, parseIcsText } = await import("./icalSync");

const VCALENDAR_HEADER = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//Test//EN\r\n";
const VCALENDAR_FOOTER = "END:VCALENDAR\r\n";

const wrap = (events: string): string => `${VCALENDAR_HEADER}${events}${VCALENDAR_FOOTER}`;

describe("parseIcsText", () => {
	it("extracts checkIn/checkOut from an all-day event with DTEND", () => {
		const ics = wrap(
			"BEGIN:VEVENT\r\n" +
				"UID:block-1@airbnb.com\r\n" +
				"DTSTART;VALUE=DATE:20260801\r\n" +
				"DTEND;VALUE=DATE:20260805\r\n" +
				"SUMMARY:Reserved\r\n" +
				"END:VEVENT\r\n"
		);

		expect(parseIcsText(ics)).toEqual([
			{ uid: "block-1@airbnb.com", checkIn: "2026-08-01", checkOut: "2026-08-05" },
		]);
	});

	it("defaults checkOut to checkIn + 1 day when DTEND is absent (RFC 5545 implicit duration)", () => {
		const ics = wrap(
			"BEGIN:VEVENT\r\n" +
				"UID:block-2@airbnb.com\r\n" +
				"DTSTART;VALUE=DATE:20260810\r\n" +
				"SUMMARY:Reserved\r\n" +
				"END:VEVENT\r\n"
		);

		expect(parseIcsText(ics)).toEqual([
			{ uid: "block-2@airbnb.com", checkIn: "2026-08-10", checkOut: "2026-08-11" },
		]);
	});

	it("excludes cancelled events so they get pruned like removed ones", () => {
		const ics = wrap(
			"BEGIN:VEVENT\r\n" +
				"UID:block-3@airbnb.com\r\n" +
				"DTSTART;VALUE=DATE:20260815\r\n" +
				"DTEND;VALUE=DATE:20260816\r\n" +
				"STATUS:CANCELLED\r\n" +
				"SUMMARY:Reserved\r\n" +
				"END:VEVENT\r\n"
		);

		expect(parseIcsText(ics)).toEqual([]);
	});

	it("only returns VEVENT components, ignoring VCALENDAR-level metadata", () => {
		const ics = wrap(
			"BEGIN:VEVENT\r\n" +
				"UID:block-4@airbnb.com\r\n" +
				"DTSTART;VALUE=DATE:20260901\r\n" +
				"DTEND;VALUE=DATE:20260903\r\n" +
				"SUMMARY:Reserved\r\n" +
				"END:VEVENT\r\n"
		);

		const blocks = parseIcsText(ics);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]!.uid).toBe("block-4@airbnb.com");
	});

	it("produces calendar-correct dates independent of the runner's local timezone", () => {
		// All-day VALUE=DATE events are parsed as UTC-midnight Dates by node-ical;
		// toIsoDate must read them with UTC getters, not local ones, or a
		// negative-UTC-offset runner would see an off-by-one day here.
		const ics = wrap(
			"BEGIN:VEVENT\r\n" +
				"UID:block-5@vrbo.com\r\n" +
				"DTSTART;VALUE=DATE:20260101\r\n" +
				"DTEND;VALUE=DATE:20260102\r\n" +
				"SUMMARY:Reserved\r\n" +
				"END:VEVENT\r\n"
		);

		expect(parseIcsText(ics)).toEqual([
			{ uid: "block-5@vrbo.com", checkIn: "2026-01-01", checkOut: "2026-01-02" },
		]);
	});
});

describe("diffBlocks", () => {
	it("classifies a uid not present in existing rows as inserted", () => {
		const diff = diffBlocks([{ uid: "a", checkIn: "2026-01-01", checkOut: "2026-01-03" }], []);
		expect(diff).toEqual({
			inserted: [{ uid: "a", checkIn: "2026-01-01", checkOut: "2026-01-03" }],
			updated: [],
			unchanged: [],
		});
	});

	it("classifies a uid with unchanged dates as unchanged", () => {
		const block = { uid: "a", checkIn: "2026-01-01", checkOut: "2026-01-03" };
		const diff = diffBlocks([block], [block]);
		expect(diff).toEqual({ inserted: [], updated: [], unchanged: [block] });
	});

	it("classifies a uid whose dates changed as updated", () => {
		const incoming = { uid: "a", checkIn: "2026-01-01", checkOut: "2026-01-05" };
		const existing = { uid: "a", checkIn: "2026-01-01", checkOut: "2026-01-03" };
		const diff = diffBlocks([incoming], [existing]);
		expect(diff).toEqual({ inserted: [], updated: [incoming], unchanged: [] });
	});

	it("returns an empty diff for empty incoming (the all-pruned case)", () => {
		const diff = diffBlocks([], [{ uid: "a", checkIn: "2026-01-01", checkOut: "2026-01-03" }]);
		expect(diff).toEqual({ inserted: [], updated: [], unchanged: [] });
	});
});
