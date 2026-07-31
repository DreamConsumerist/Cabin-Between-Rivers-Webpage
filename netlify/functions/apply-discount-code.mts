import { z } from "zod";
import { error, json, parseJsonBody, requireMethod, withErrorHandling } from "../../lib/http";
import { getReservationById } from "../../lib/availability";
import { applyDiscountCode } from "../../lib/discountCodes";

// code: null/absent clears whatever discount is currently applied. An empty
// string is treated the same as null (see lib/discountCodes.ts's
// applyDiscountCode) rather than rejected, so a guest clearing the input box
// and resubmitting removes the code instead of erroring.
const bodySchema = z.object({
	reservationId: z.number().int().positive(),
	code: z.string().max(50).nullable().optional(),
});

// POST /api/apply-discount-code
// Applies (or clears) a discount code against a still-pending reservation's
// price, recomputed server-side — never trusts a client-supplied amount. The
// booking flow's payment step (CheckoutStep.tsx) re-mounts Stripe's embedded
// checkout whenever this changes the reservation's amountTotal (create-payment
// keys its Stripe idempotency on the amount, so a new total gets a new
// Checkout Session).
export default withErrorHandling("apply-discount-code", async (req, _context) => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = bodySchema.safeParse(parsedBody.body);
	if (!parsed.success) return error("reservationId is required");

	const reservation = await getReservationById(parsed.data.reservationId);
	if (!reservation) return error("Reservation not found", 404);
	if (reservation.status !== "pending") {
		return error("Reservation is no longer available for payment", 409);
	}
	if (reservation.holdExpiresAt && new Date(reservation.holdExpiresAt) < new Date()) {
		return error("Hold has expired — please rebook", 410);
	}

	const result = await applyDiscountCode(parsed.data.reservationId, parsed.data.code ?? null);
	if (!result.ok) {
		if (result.reason === "invalid-code") return error("That code isn't valid", 404);
		return error("Reservation not found", 404);
	}

	return json({
		amountTotal: result.reservation.amountTotal,
		discountAmount: result.reservation.discountAmount,
		applied: result.reservation.discountCodeId != null,
		code: result.appliedCode,
	});
});
