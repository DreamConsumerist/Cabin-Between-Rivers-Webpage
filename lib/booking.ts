import dayjs from "dayjs";
import { z } from "zod";

// How long a pending reservation holds its dates before the hold lapses.
// (Deferred decision — default 15 minutes; may later move into the settings table.)
export const HOLD_MINUTES = 15;

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "expected date as YYYY-MM-DD");

// Payload for POST /api/create-booking.
export const createBookingSchema = z
	.object({
		checkIn: isoDate,
		checkOut: isoDate,
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

// Total price in cents. All inputs are cents; nightly rate is per night.
export const computeTotalCents = (
	nights: number,
	nightlyRateCents: number,
	cleaningFeeCents: number
): number => nights * nightlyRateCents + cleaningFeeCents;
