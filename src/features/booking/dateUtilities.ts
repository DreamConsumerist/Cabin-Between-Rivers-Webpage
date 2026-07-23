import dayjs, { type Dayjs } from "dayjs";
import type { BlockedRange, Pricing } from "./api";

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

export const computeEstimatedTotalCents = (nights: number, pricing: Pricing): number =>
	nights * pricing.nightlyRate + pricing.cleaningFee;

export const formatCents = (cents: number): string =>
	(cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
