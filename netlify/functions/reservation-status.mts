import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, requireMethod } from "../../lib/http";
import { getReservationById } from "../../lib/availability";

const querySchema = z.coerce.number().int().positive();

// GET /api/reservation-status?reservationId=123 -> { status }
// Used by the confirmation page to poll for the webhook flipping a reservation to
// `confirmed`. Deliberately returns ONLY the status — this endpoint takes a raw,
// guessable id with no auth, so guest name/email/amount must never be exposed here.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	const raw = new URL(req.url).searchParams.get("reservationId");
	const parsed = querySchema.safeParse(raw);
	if (!parsed.success) return error("reservationId is required");

	const reservation = await getReservationById(parsed.data);
	if (!reservation) return error("Reservation not found", 404);

	return json({ status: reservation.status });
};
