import type { Context } from "@netlify/functions";
import { error, json, parseJsonBody, requireMethod } from "../../lib/http";
import {
	computeTotalCentsWithOverrides,
	createBookingSchema,
	nightsBetween,
} from "../../lib/booking";
import {
	expireLapsedHolds,
	getSettings,
	hasExternalBlockOverlap,
	insertPendingReservation,
	isOverlapError,
} from "../../lib/availability";
import { getPriceOverridesForRange } from "../../lib/priceOverrides";

// POST /api/create-booking
// Validates the request, prices it server-side, and creates a PENDING hold.
// Same-site overlap is guaranteed impossible by the DB EXCLUDE constraint;
// Airbnb/Vrbo overlap is checked here. Returns the reservation id + amount,
// which the (later) Stripe step will charge.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = createBookingSchema.safeParse(parsedBody.body);
	if (!parsed.success) {
		return json({ error: "Invalid booking", issues: parsed.error.issues }, 400);
	}
	const input = parsed.data;

	try {
		const config = await getSettings();
		if (!config) return error("Booking is not configured yet", 503);

		const nights = nightsBetween(input.checkIn, input.checkOut);
		if (nights < config.minNights) {
			return error(`Minimum stay is ${config.minNights} night(s)`, 422);
		}

		// Free any lapsed holds first so they neither block availability nor the
		// EXCLUDE constraint, regardless of whether the cron has run.
		await expireLapsedHolds();

		if (await hasExternalBlockOverlap(input.checkIn, input.checkOut)) {
			return error("Those dates are unavailable", 409);
		}

		const overrides = await getPriceOverridesForRange(input.checkIn, input.checkOut);
		const amountTotal = computeTotalCentsWithOverrides(
			input.checkIn,
			input.checkOut,
			config.nightlyRate,
			config.cleaningFee,
			overrides
		);

		const reservation = await insertPendingReservation({ ...input, amountTotal });
		return json(
			{
				reservationId: reservation.id,
				amountTotal: reservation.amountTotal,
				holdExpiresAt: reservation.holdExpiresAt,
				nights,
			},
			201
		);
	} catch (e) {
		if (isOverlapError(e)) {
			return error("Those dates were just taken", 409);
		}
		console.error("create-booking failed", e);
		return error("Could not create booking", 500);
	}
};
