import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, requireMethod } from "../../lib/http";
import { getReservationById } from "../../lib/availability";
import { getStripe } from "../../lib/stripe";

const bodySchema = z.object({ reservationId: z.number().int().positive() });

// POST /api/create-payment
// Starts an embedded Stripe Checkout Session for a PENDING reservation. The amount
// charged always comes from the reservation row (priced server-side in
// create-booking), never from the client. Confirmation happens via stripe-webhook,
// not this response — the browser only uses the returned clientSecret to mount
// Stripe's embedded checkout UI.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return error("Invalid JSON body");
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) return error("reservationId is required");

	const reservation = await getReservationById(parsed.data.reservationId);
	if (!reservation) return error("Reservation not found", 404);
	if (reservation.status !== "pending") {
		return error("Reservation is no longer available for payment", 409);
	}
	if (reservation.holdExpiresAt && new Date(reservation.holdExpiresAt) < new Date()) {
		return error("Hold has expired — please rebook", 410);
	}

	try {
		const origin = new URL(req.url).origin;
		const session = await getStripe().checkout.sessions.create({
			ui_mode: "embedded_page",
			mode: "payment",
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: "usd",
						unit_amount: reservation.amountTotal,
						product_data: {
							name: `Cabin reservation: ${reservation.checkIn} to ${reservation.checkOut}`,
						},
					},
				},
			],
			metadata: { reservationId: String(reservation.id) },
			// reservationId is appended so the confirmation page can poll our own
			// reservation-status endpoint directly, without needing to look the
			// session up via Stripe (the webhook is what actually confirms it).
			return_url: `${origin}/booking/confirmation?sessionId={CHECKOUT_SESSION_ID}&reservationId=${reservation.id}`,
		});

		return json({ clientSecret: session.client_secret });
	} catch (e) {
		console.error("create-payment failed", e);
		return error("Could not start payment", 500);
	}
};
