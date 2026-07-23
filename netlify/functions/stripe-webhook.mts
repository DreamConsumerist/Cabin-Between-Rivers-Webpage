import type { Context } from "@netlify/functions";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { processedWebhookEvents, reservations } from "../../db/schema";
import { error, json } from "../../lib/http";
import { getStripe, getWebhookSecret } from "../../lib/stripe";

// POST /.netlify/functions/stripe-webhook (not proxied through /api/* — keep the
// raw Stripe-facing path so nothing rewrites the request body before we read it).
// Source of truth for payment confirmation: never trust the browser return_url.
export default async (req: Request, _context: Context): Promise<Response> => {
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

	// Idempotency: record event.id first; a conflict means we've already handled
	// this delivery (Stripe retries the same event on non-2xx / timeout).
	const inserted = await db
		.insert(processedWebhookEvents)
		.values({ eventId: event.id })
		.onConflictDoNothing({ target: processedWebhookEvents.eventId })
		.returning({ eventId: processedWebhookEvents.eventId });

	if (inserted.length === 0) {
		return json({ received: true });
	}

	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;
		const reservationId = Number(session.metadata?.reservationId);
		const paymentIntentId =
			typeof session.payment_intent === "string" ? session.payment_intent : null;

		if (Number.isFinite(reservationId)) {
			await db
				.update(reservations)
				.set({ status: "confirmed", stripePaymentIntentId: paymentIntentId })
				.where(eq(reservations.id, reservationId));
		}
	}

	return json({ received: true });
};
