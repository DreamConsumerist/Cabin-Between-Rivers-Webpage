import dayjs from "dayjs";
import { z } from "zod";
import { constantTimeEquals } from "../../lib/adminAuth";
import { adminCancelReservation, getReservationById } from "../../lib/availability";
import { error, json, parseJsonBody, withErrorHandling } from "../../lib/http";
import { notifyGuestCancellation, sendCancellationEmail } from "../../lib/mailer";
import { reportCritical } from "../../lib/sentry";
import { refundPayment } from "../../lib/stripe";

const querySchema = z.object({
	reservationId: z.coerce.number().int().positive(),
	token: z.string().min(1),
});

// Initial cutoff — see SETUP.md's "Later phases" for the eventual
// cancellation-fee/tiered-cutoff policy this is standing in for. One
// inequality covers three cases at once: less than 24h before check-in,
// during the stay, and after it — once `checkIn` itself has passed, "now"
// is trivially more than 24h past it too, so no separate check-in/check-out
// comparison is needed. `dayjs(checkIn)` parses the date-only string as
// local midnight, same convention as BookingsList.tsx's formatDate.
const CANCELLATION_CUTOFF_HOURS = 24;
const isBeforeCancellationDeadline = (checkIn: string): boolean =>
	dayjs().isBefore(dayjs(checkIn).subtract(CANCELLATION_CUTOFF_HOURS, "hour"));

// A guest's own reservation.cancellationToken (see db/schema.ts) is the only
// credential this endpoint checks — no login. Any missing/mismatched token,
// unknown reservationId, or pre-feature row with no token at all is a generic
// 404, same "guesser can't distinguish" reasoning as calendar-export.mts's
// public token gate. A token match IS proof of ownership, though, so once
// past that check, responses below are as specific as needed.
const authorize = async (
	rawReservationId: unknown,
	rawToken: unknown
): Promise<Awaited<ReturnType<typeof getReservationById>> | null> => {
	const parsed = querySchema.safeParse({ reservationId: rawReservationId, token: rawToken });
	if (!parsed.success) return null;

	const reservation = await getReservationById(parsed.data.reservationId);
	if (!reservation?.cancellationToken) return null;
	if (!constantTimeEquals(parsed.data.token, reservation.cancellationToken)) return null;
	return reservation;
};

// GET /api/cancel-my-reservation?reservationId=&token= -> booking summary for
// the guest-facing cancel-confirmation page to render before they commit.
// POST (same params, in the body) -> actually cancels + refunds in full. Two
// steps rather than a single GET-does-it link deliberately — email link
// scanners/previewers (Outlook Safe Links, corporate proxies, etc.) fetch
// links automatically, so a bare GET that cancels on load would let a
// scanner cancel a guest's stay before they ever open the email themselves.
export default withErrorHandling("cancel-my-reservation", async (req, _context) => {
	if (req.method === "GET") {
		const url = new URL(req.url);
		const reservation = await authorize(
			url.searchParams.get("reservationId"),
			url.searchParams.get("token")
		);
		if (!reservation) return error("Not found", 404);

		if (reservation.status !== "confirmed") {
			return json({ eligible: false, reason: reservation.status });
		}
		if (!isBeforeCancellationDeadline(reservation.checkIn)) {
			return json({ eligible: false, reason: "too_close_to_checkin" });
		}
		return json({
			eligible: true,
			checkIn: reservation.checkIn,
			checkOut: reservation.checkOut,
			guests: reservation.guests,
			amountTotal: reservation.amountTotal,
		});
	}

	if (req.method === "POST") {
		const parsedBody = await parseJsonBody(req);
		if (!parsedBody.ok) return parsedBody.response;
		const body = parsedBody.body as Record<string, unknown> | null;

		const reservation = await authorize(body?.reservationId, body?.token);
		if (!reservation) return error("Not found", 404);
		if (reservation.status !== "confirmed") {
			return error("This reservation is no longer eligible for cancellation.", 409);
		}
		if (!isBeforeCancellationDeadline(reservation.checkIn)) {
			return error(
				"This reservation is too close to (or past) check-in to cancel online — please contact us directly.",
				409
			);
		}

		// Unconditional full refund for now — see SETUP.md's "Later phases" for
		// a possible last-minute-cancellation-fee policy.
		if (!reservation.stripePaymentIntentId) {
			// Confirmed reservations always have one (set by stripe-webhook.mts
			// when it confirms) — this is a data-integrity guard, not a real
			// path, so it doesn't need guest-friendly wording.
			console.error(
				`cancel-my-reservation: CRITICAL — reservation ${reservation.id} is confirmed with no stripePaymentIntentId`
			);
			await reportCritical("Confirmed reservation has no stripePaymentIntentId", {
				reservationId: reservation.id,
			});
			return error("Could not process cancellation — please contact us directly.", 500);
		}
		try {
			await refundPayment(reservation.stripePaymentIntentId);
		} catch (e) {
			console.error(`cancel-my-reservation: refund failed for reservation ${reservation.id}`, e);
			return error("Refund failed — please contact us directly.", 502);
		}

		try {
			const cancelled = await adminCancelReservation(reservation.id);
			if (!cancelled) {
				// Refund already went through — same "needs a human" reasoning as
				// admin-cancel-reservation.mts's identical race.
				console.error(
					`cancel-my-reservation: CRITICAL — reservation ${reservation.id} was refunded but the status update failed; fix the status manually`
				);
				await reportCritical("Refund succeeded but reservation status update returned no row", {
					reservationId: reservation.id,
				});
				return error("Refund succeeded but cancellation failed — please contact us.", 500);
			}

			await sendCancellationEmail({
				guestName: cancelled.guestName,
				guestEmail: cancelled.guestEmail,
				checkIn: cancelled.checkIn,
				checkOut: cancelled.checkOut,
				amountTotal: cancelled.amountTotal,
				refunded: true,
			});
			await notifyGuestCancellation({
				reservationId: cancelled.id,
				guestName: cancelled.guestName,
				guestEmail: cancelled.guestEmail,
				checkIn: cancelled.checkIn,
				checkOut: cancelled.checkOut,
				amountTotal: cancelled.amountTotal,
			});

			return json({ cancelled: true });
		} catch (e) {
			console.error(
				`cancel-my-reservation: CRITICAL — reservation ${reservation.id} was refunded but the status update threw; fix the status manually`,
				e
			);
			await reportCritical(
				"Refund succeeded but reservation status update threw",
				{ reservationId: reservation.id },
				e
			);
			return error("Refund succeeded but cancellation failed — please contact us.", 500);
		}
	}

	return error("Method not allowed", 405);
});
