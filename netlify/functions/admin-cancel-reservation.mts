import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, parseJsonBody, requireMethod } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { adminCancelReservation, getReservationById } from "../../lib/availability";
import { refundPayment } from "../../lib/stripe";

const bodySchema = z.object({ reservationId: z.number().int().positive() });

// POST /api/admin-cancel-reservation — admin-authority cancel + refund. Used
// by the double-booking reconciliation tool (Conflicts tab and the Bookings
// tab's overflow menu) to resolve a conflict by freeing the site's side:
// refunds via Stripe first when a payment was charged, then cancels the
// reservation. Unlike the guest-facing cancel-reservation.mts, this works on
// confirmed reservations, not just pending holds.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = bodySchema.safeParse(parsedBody.body);
	if (!parsed.success) return error("reservationId is required");

	const reservation = await getReservationById(parsed.data.reservationId);
	if (!reservation) return error("Reservation not found", 404);
	if (reservation.status !== "confirmed" && reservation.status !== "pending") {
		return error("Reservation is already inactive", 409);
	}

	let refunded = false;
	if (reservation.stripePaymentIntentId) {
		try {
			await refundPayment(reservation.stripePaymentIntentId);
			refunded = true;
		} catch (e) {
			console.error(`admin-cancel-reservation: refund failed for reservation ${reservation.id}`, e);
			return error("Refund failed — reservation was not cancelled. Check the Stripe dashboard.", 502);
		}
	}

	try {
		const cancelled = await adminCancelReservation(reservation.id);
		return json({ reservation: cancelled, refunded });
	} catch (e) {
		// The refund (if any) already went through at this point — this is a
		// genuine inconsistency (money moved, status didn't) that needs a human,
		// not a silent retry.
		console.error(
			`admin-cancel-reservation: CRITICAL — reservation ${reservation.id} was refunded=${refunded} but the status update failed; fix the status manually`,
			e
		);
		return error(
			refunded
				? "Refund succeeded but the reservation status could not be updated — fix its status manually."
				: "Could not cancel the reservation.",
			500
		);
	}
};
