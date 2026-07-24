import dayjs, { type Dayjs } from "dayjs";
import { z } from "zod";

// How long a pending reservation holds its dates before the hold lapses.
// (Deferred decision — default 15 minutes; may later move into the settings table.)
export const HOLD_MINUTES = 15;

export const isoDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "expected date as YYYY-MM-DD");

// Payload for POST /api/create-booking.
export const createBookingSchema = z
	.object({
		checkIn: isoDateSchema,
		checkOut: isoDateSchema,
		guestName: z.string().trim().min(1).max(255),
		guestEmail: z.string().trim().email().max(255),
		guestPhone: z.string().trim().min(1).max(50),
		guests: z.number().int().min(1).max(20),
	})
	.refine((v) => dayjs(v.checkOut).isAfter(dayjs(v.checkIn)), {
		message: "checkOut must be after checkIn",
		path: ["checkOut"],
	})
	.refine((v) => !dayjs(v.checkIn).isBefore(dayjs().startOf("day")), {
		message: "checkIn cannot be in the past",
		path: ["checkIn"],
	});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// Number of nights between two ISO dates (check-out day is not charged).
export const nightsBetween = (checkIn: string, checkOut: string): number =>
	dayjs(checkOut).diff(dayjs(checkIn), "day");

export type PriceOverrideRange = {
	checkIn: string;
	checkOut: string;
	nightlyRate: number;
};

// The nightly rate in effect for a given night: the override covering it, if
// any, else the default rate. Overlapping overrides are rejected at the DB
// level (price_overrides_no_overlap), so at most one ever matches.
const nightlyRateForNight = (
	night: Dayjs,
	defaultRateCents: number,
	overrides: Array<PriceOverrideRange>
): number => {
	const override = overrides.find(
		(o) => !night.isBefore(dayjs(o.checkIn), "day") && night.isBefore(dayjs(o.checkOut), "day")
	);
	return override ? override.nightlyRate : defaultRateCents;
};

// Total price in cents for a stay, summing each night's rate (default or
// overridden) plus the flat cleaning fee. All money inputs are cents.
export const computeTotalCentsWithOverrides = (
	checkIn: string,
	checkOut: string,
	defaultRateCents: number,
	cleaningFeeCents: number,
	overrides: Array<PriceOverrideRange>
): number => {
	let total = cleaningFeeCents;
	let night = dayjs(checkIn);
	const end = dayjs(checkOut);
	while (night.isBefore(end, "day")) {
		total += nightlyRateForNight(night, defaultRateCents, overrides);
		night = night.add(1, "day");
	}
	return total;
};
