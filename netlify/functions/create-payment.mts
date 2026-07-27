import { z } from "zod";
import { error, json, parseJsonBody, requireMethod, withErrorHandling } from "../../lib/http";
import { getReservationById } from "../../lib/availability";
import { getConfigurationById } from "../../lib/bookingConfigurations";
import { getStripe } from "../../lib/stripe";

const bodySchema = z.object({ reservationId: z.number().int().positive() });

// Compact date range for the Stripe statement descriptor suffix — see the
// comment at its call site for the character budget this has to fit in.
// Leading "D" (for "dates") is required — Stripe rejects a suffix with no
// Latin character, and MMDD-DD/MMDD-MMDD are otherwise all digits/dashes.
// Same-month stays use "DMMDD-DD" (8 chars); cross-month stays use
// "DMMDD-MMDD" (10 chars) — both fit within the 10-char suffix budget.
const statementDateRange = (checkIn: string, checkOut: string): string => {
	const [, inMonth, inDay] = checkIn.split("-");
	const [, outMonth, outDay] = checkOut.split("-");
	if (inMonth === outMonth) return `D${inMonth}${inDay}-${outDay}`;
	return `D${inMonth}${inDay}-${outMonth}${outDay}`;
};

// POST /api/create-payment
// Starts an embedded Stripe Checkout Session for a PENDING reservation. The amount
// charged always comes from the reservation row (priced server-side in
// create-booking), never from the client. Confirmation happens via stripe-webhook,
// not this response — the browser only uses the returned clientSecret to mount
// Stripe's embedded checkout UI.
export default withErrorHandling("create-payment", async (req, _context) => {
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

	try {
		const configuration = await getConfigurationById(reservation.configurationId);
		const origin = new URL(req.url).origin;
		const session = await getStripe().checkout.sessions.create(
			{
				ui_mode: "embedded_page",
				mode: "payment",
				line_items: [
					{
						quantity: 1,
						price_data: {
							currency: "usd",
							unit_amount: reservation.amountTotal,
							product_data: {
								name: `${configuration?.name ?? "Cabin"} reservation: ${reservation.checkIn} to ${reservation.checkOut}`,
							},
						},
					},
				],
				metadata: {
					reservationId: String(reservation.id),
					configurationId: String(reservation.configurationId),
					configurationName: configuration?.name ?? "",
				},
				payment_intent_data: {
					// Appended by Stripe as "<account's shortened descriptor>* <suffix>"
					// on the guest's card statement. The account's shortened descriptor
					// is set to "CABBETWRiv" (10 chars) in the Stripe Dashboard, so
					// together with the "* " Stripe inserts and this suffix, the guest
					// sees "CABBETWRiv* <dates>" — reading as "...Riv..." to complete
					// "Cabin Between Rivers". Stripe caps the combined descriptor at 22
					// chars, leaving exactly 10 for this suffix — enough for either a
					// same-month or cross-month date range (see statementDateRange).
					statement_descriptor_suffix: statementDateRange(reservation.checkIn, reservation.checkOut),
				},
				// reservationId is appended so the confirmation page can poll our own
				// reservation-status endpoint directly, without needing to look the
				// session up via Stripe (the webhook is what actually confirms it).
				return_url: `${origin}/booking/confirmation?sessionId={CHECKOUT_SESSION_ID}&reservationId=${reservation.id}`,
			},
			{
				// Scoped to the reservation (not the request) so a double-submit or a
				// remount mid-checkout (page reload, duplicate click) reuses the same
				// Checkout Session instead of minting a second one that could later be
				// paid twice. A reservation only ever has one hold window, so reusing
				// the key for its lifetime is safe.
				idempotencyKey: `create-payment-${reservation.id}`,
			}
		);

		return json({ clientSecret: session.client_secret });
	} catch (e) {
		console.error("create-payment failed", e);
		return error("Could not start payment", 500);
	}
});
