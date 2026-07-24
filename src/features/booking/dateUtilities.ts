import dayjs, { type Dayjs } from "dayjs";
import type { BlockedRange, PriceOverride, Pricing } from "./api";

export const toIsoDate = (d: Dayjs): string => d.format("YYYY-MM-DD");

// Does [aStart, aEnd) overlap [bStart, bEnd)? Half-open ranges — same semantics as
// the server's `daterange(..., '[)')` exclusion constraint.
const rangesOverlap = (aStart: Dayjs, aEnd: Dayjs, bStart: Dayjs, bEnd: Dayjs): boolean =>
	aStart.isBefore(bEnd) && bStart.isBefore(aEnd);

export const isDateBlocked = (date: Dayjs, blocked: Array<BlockedRange>): boolean => {
	const nextDay = date.add(1, "day");
	return blocked.some((b) => rangesOverlap(date, nextDay, dayjs(b.checkIn), dayjs(b.checkOut)));
};

export const isRangeBlocked = (
	checkIn: Dayjs,
	checkOut: Dayjs,
	blocked: Array<BlockedRange>
): boolean => blocked.some((b) => rangesOverlap(checkIn, checkOut, dayjs(b.checkIn), dayjs(b.checkOut)));

export type CalendarDay = { date: Dayjs; inMonth: boolean };

// Days to render for a month grid, padded to full weeks, each tagged with whether
// it belongs to the displayed month (so out-of-month days can render dimmed).
export const getMonthGrid = (monthStart: Dayjs): Array<CalendarDay> => {
	const firstOfMonth = monthStart.startOf("month");
	const gridStart = firstOfMonth.startOf("week");
	const gridEnd = monthStart.endOf("month").endOf("week");

	const days: Array<CalendarDay> = [];
	let cursor = gridStart;
	while (cursor.isBefore(gridEnd) || cursor.isSame(gridEnd, "day")) {
		days.push({ date: cursor, inMonth: cursor.isSame(monthStart, "month") });
		cursor = cursor.add(1, "day");
	}
	return days;
};

// The nightly rate in effect for a given night: the override covering it, if
// any, else the default rate. Mirrors lib/booking.ts's nightlyRateForNight —
// the server is authoritative; this is only for the client-side estimate.
export const nightlyRateForDate = (
	date: Dayjs,
	defaultRate: number,
	overrides: Array<PriceOverride>
): number => {
	const override = overrides.find(
		(o) => !date.isBefore(dayjs(o.checkIn), "day") && date.isBefore(dayjs(o.checkOut), "day")
	);
	return override ? override.nightlyRate : defaultRate;
};

export const computeEstimatedTotalCents = (
	checkIn: Dayjs,
	checkOut: Dayjs,
	pricing: Pricing,
	overrides: Array<PriceOverride>
): number => {
	let total = pricing.cleaningFee;
	let night = checkIn;
	while (night.isBefore(checkOut, "day")) {
		total += nightlyRateForDate(night, pricing.nightlyRate, overrides);
		night = night.add(1, "day");
	}
	return total;
};

export const formatCents = (cents: number): string =>
	(cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// Compact form for tight spaces (calendar day cells): drops cents when the
// rate is a whole dollar amount, which nightly rates always are in practice.
export const formatCentsCompact = (cents: number): string =>
	cents % 100 === 0 ? `$${cents / 100}` : formatCents(cents);

export type NightlyLineItem = { date: Dayjs; rateCents: number };

export const buildNightlyBreakdown = (
	checkIn: Dayjs,
	checkOut: Dayjs,
	pricing: Pricing,
	overrides: Array<PriceOverride>
): Array<NightlyLineItem> => {
	const nights: Array<NightlyLineItem> = [];
	let night = checkIn;
	while (night.isBefore(checkOut, "day")) {
		nights.push({ date: night, rateCents: nightlyRateForDate(night, pricing.nightlyRate, overrides) });
		night = night.add(1, "day");
	}
	return nights;
};
