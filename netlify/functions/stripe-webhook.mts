import type Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db/client";
import { processedWebhookEvents, reservations } from "../../db/schema";
import { getReservationById, getSettings, isOverlapError } from "../../lib/availability";
import { flagDoubleBooking } from "../../lib/conflicts";
import { error, json, withErrorHandling } from "../../lib/http";
import {
	notifyBookingConfirmed,
	scheduleCheckInReminder,
	scheduleCheckOutReminder,
	sendBookingConfirmationEmail,
} from "../../lib/mailer";
import { reportCritical } from "../../lib/sentry";
import { getStripe, getWebhookSecret } from "../../lib/stripe";

// POST /.netlify/functions/stripe-webhook (not proxied through /api/* — keep the
// raw Stripe-facing path so nothing rewrites the request body before we read it).
// Source of truth for payment confirmation: never trust the browser return_url.
export default withErrorHandling("stripe-webhook", async (req, _context) => {
	if (req.method !== "POST") return error("Method not allowed", 405);

	const signature = req.headers.get("stripe-signature");
	if (!signature) return error("Missing signature", 400);

	// Must read as raw text — parsing to JSON first breaks signature verification.
	const rawBody = await req.text();

	let event: Stripe.Event;
	try {
		event = await getStripe().webhooks.constructEventAsync(
			rawBody,
			signature,
			getWebhookSecret()
		);
	} catch (e) {
		console.error("stripe-webhook: signature verification failed", e);
		return error("Invalid signature", 400);
	}

	// Idempotency check only (no insert yet): a hit means we've already fully
	// processed this delivery, so skip straight to 200. We don't record the
	// event as processed until after the work below succeeds — recording it
	// first would mean a failed update is never retried, since Stripe only
	// retries on non-2xx and our own idempotency check would swallow the
	// redelivery before it could redo the update.
	const alreadyProcessed = await db
		.select({ eventId: processedWebhookEvents.eventId })
		.from(processedWebhookEvents)
		.where(eq(processedWebhookEvents.eventId, event.id))
		.limit(1);

	if (alreadyProcessed.length > 0) {
		return json({ received: true });
	}

	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;
		const reservationId = Number(session.metadata?.reservationId);
		const paymentIntentId =
			typeof session.payment_intent === "string" ? session.payment_intent : null;

		if (!Number.isFinite(reservationId)) {
			console.error(
				`stripe-webhook: session ${session.id} (event ${event.id}) is missing a valid reservationId in metadata — payment succeeded but no reservation can be confirmed`,
				session.metadata
			);
		} else {
			try {
				// Guarded on status != confirmed rather than status = pending so a
				// retry (or a reservation the pagehide-beacon cancelled while this
				// payment was in flight) still gets confirmed instead of silently
				// no-op'ing. The dates themselves are protected by the DB's overlap
				// EXCLUDE constraint, not by this WHERE clause.
				const confirmed = await db
					.update(reservations)
					.set({ status: "confirmed", stripePaymentIntentId: paymentIntentId })
					.where(
						and(eq(reservations.id, reservationId), ne(reservations.status, "confirmed"))
					)
					.returning();

				// Empty on a redelivered event that already confirmed this
				// reservation (the WHERE clause matched nothing) — skip the email
				// so a Stripe retry never sends a duplicate notification.
				const reservation = confirmed[0];
				if (reservation) {
					const details = {
						reservationId: reservation.id,
						guestName: reservation.guestName,
						guestEmail: reservation.guestEmail,
						checkIn: reservation.checkIn,
						checkOut: reservation.checkOut,
						guests: reservation.guests,
						amountTotal: reservation.amountTotal,
						// Admin-gated (see admin-id-photo.mts) — safe to include as a
						// plain link since only an authenticated admin session can
						// actually load it. Null when the guest never got prompted to
						// upload one (shouldn't happen via the normal booking flow,
						// which requires it before payment, but isn't guaranteed for
						// every historical row).
						idPhotoUrl: reservation.idPhotoBlobKey
							? `${new URL(req.url).origin}/api/admin-id-photo?reservationId=${reservation.id}`
							: null,
						// cancellationToken is guaranteed here — this reservation was
						// just inserted by create-booking.mts (the only inserter),
						// which always mints one (see insertPendingReservation). Only
						// pre-migration rows can lack it, and those never reach a
						// fresh confirmation.
						cancellationUrl: `${new URL(req.url).origin}/booking/cancel?reservationId=${reservation.id}&token=${reservation.cancellationToken}`,
					};
					await notifyBookingConfirmed(details);
					await sendBookingConfirmationEmail(details);

					// Best-effort: schedule the arrival/checkout reminders now, while
					// check-in is soon enough to be within Resend's scheduling window
					// (see lib/mailer.ts). A far-out booking simply gets skipped here
					// and picked up later by schedule-guest-emails.mts's catch-all
					// sweep — never worth failing an already-confirmed payment over.
					try {
						const settings = await getSettings();
						const [checkInEmailId, checkOutEmailId] = await Promise.all([
							scheduleCheckInReminder(reservation, settings),
							scheduleCheckOutReminder(reservation, settings),
						]);
						if (checkInEmailId || checkOutEmailId) {
							await db
								.update(reservations)
								.set({
									...(checkInEmailId ? { checkInEmailId } : {}),
									...(checkOutEmailId ? { checkOutEmailId } : {}),
								})
								.where(eq(reservations.id, reservation.id));
						}
					} catch (e) {
						console.error(
							`stripe-webhook: failed to schedule guest reminder emails for reservation ${reservation.id}`,
							e
						);
					}
				}
			} catch (e) {
				if (isOverlapError(e)) {
					// The guest paid, but their dates were rebooked by someone else
					// before this webhook landed (e.g. their hold lapsed, or a
					// pagehide-triggered cancel raced this same payment). Retrying
					// won't fix an overlap that's still there, so don't rethrow —
					// but this needs a human to reconcile/refund.
					console.error(
						`stripe-webhook: CRITICAL — payment succeeded for reservation ${reservationId} (event ${event.id}) but its dates are no longer available; needs manual refund/reconciliation`,
						e
					);
					await reportCritical(
						"Payment succeeded but reservation dates were rebooked before webhook landed",
						{ reservationId, stripeEventId: event.id },
						e
					);
					const reservation = await getReservationById(reservationId);
					await flagDoubleBooking({
						source: "stripe-webhook",
						checkIn: reservation?.checkIn ?? "unknown",
						checkOut: reservation?.checkOut ?? "unknown",
						detail: `Stripe payment succeeded for reservation #${reservationId} (event ${event.id}) but the dates were rebooked before the webhook landed. Needs manual refund/reconciliation.`,
						reservationId,
					});
				} else {
					console.error(
						`stripe-webhook: failed to confirm reservation ${reservationId} (event ${event.id})`,
						e
					);
					// Don't record the event as processed — return non-2xx so Stripe
					// retries the delivery and we get another chance to confirm.
					return error("Webhook handler failed", 500);
				}
			}
		}
	}

	await db
		.insert(processedWebhookEvents)
		.values({ eventId: event.id })
		.onConflictDoNothing({ target: processedWebhookEvents.eventId });

	return json({ received: true });
});
