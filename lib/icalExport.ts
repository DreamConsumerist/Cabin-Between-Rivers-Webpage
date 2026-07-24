export type ExportableReservation = {
	id: number;
	checkIn: string;
	checkOut: string;
};

// Arbitrary but fixed namespace for UIDs — RFC 5545 §3.8.4.7 only requires
// global uniqueness, not a resolvable domain. Must stay identical across
// regenerations (not derived from the request host) or Airbnb/Vrbo will treat
// every event as new and duplicate it on each poll.
const UID_DOMAIN = "cabinbetweenrivers.com";

// RFC 5545 §3.1: lines longer than 75 octets must be folded — CRLF followed
// by a single leading space, which the reader is required to strip.
const foldLine = (line: string): string => {
	if (line.length <= 75) return line;
	const parts: string[] = [line.slice(0, 75)];
	let rest = line.slice(75);
	while (rest.length > 0) {
		parts.push(rest.slice(0, 74));
		rest = rest.slice(74);
	}
	return parts.join("\r\n ");
};

// RFC 5545 §3.3.11: backslash, comma, semicolon, and newline must be escaped
// in TEXT values.
const escapeText = (text: string): string =>
	text
		.replaceAll("\\", "\\\\")
		.replaceAll(",", "\\,")
		.replaceAll(";", "\\;")
		.replaceAll("\n", "\\n");

const toIcsDate = (isoDate: string): string => isoDate.replaceAll("-", "");

const toIcsTimestamp = (date: Date): string =>
	date
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}Z$/, "Z");

// reservation -> VEVENT lines. DTEND = checkOut as-is: this codebase's
// [checkIn, checkOut) convention is already exclusive-end, so unlike the
// import side's addOneDay (lib/icalSync.ts), no adjustment is needed going
// this direction — export always has an explicit checkOut.
const toVEvent = (
	reservation: ExportableReservation,
	dtstamp: string
): string[] => [
	"BEGIN:VEVENT",
	`UID:reservation-${reservation.id}@${UID_DOMAIN}`,
	`DTSTAMP:${dtstamp}`,
	`DTSTART;VALUE=DATE:${toIcsDate(reservation.checkIn)}`,
	`DTEND;VALUE=DATE:${toIcsDate(reservation.checkOut)}`,
	// Fixed, generic text — never guest PII. ExportableReservation itself
	// carries no name/email/phone, so there's no PII path into this feed even
	// if SUMMARY becomes dynamic later.
	`SUMMARY:${escapeText("Cabin Between Rivers — Booked")}`,
	"END:VEVENT",
];

// Pure: reservation rows -> full ICS text. `now` is injectable for tests.
export const buildReservationsIcs = (
	reservations: ExportableReservation[],
	now: Date = new Date()
): string => {
	const dtstamp = toIcsTimestamp(now);
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Cabin Between Rivers//Booking Export//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		...reservations.flatMap((reservation) => toVEvent(reservation, dtstamp)),
		"END:VCALENDAR",
	];
	return lines.map(foldLine).join("\r\n") + "\r\n";
};
