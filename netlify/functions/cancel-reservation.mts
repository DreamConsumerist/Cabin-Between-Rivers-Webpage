import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, parseJsonBody, requireMethod } from "../../lib/http";
import { cancelPendingReservation } from "../../lib/availability";

const bodySchema = z.object({ reservationId: z.number().int().positive() });

// POST /api/cancel-reservation
// Used when a guest backs out of a still-pending hold (e.g. going back from the
// payment step to change dates or details), so the dates free up immediately
// instead of sitting blocked for the rest of the hold window.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = bodySchema.safeParse(parsedBody.body);
	if (!parsed.success) return error("reservationId is required");

	const cancelled = await cancelPendingReservation(parsed.data.reservationId);
	return json({ cancelled });
};
