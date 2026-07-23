import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import type { FunctionComponent } from "../../common/types";
import { createPayment } from "./api";

const publishableKey = import.meta.env["VITE_STRIPE_PUBLISHABLE_KEY"] as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = (): Promise<Stripe | null> => {
	if (!stripePromise) {
		if (!publishableKey) {
			throw new Error("VITE_STRIPE_PUBLISHABLE_KEY is not set");
		}
		stripePromise = loadStripe(publishableKey);
	}
	return stripePromise;
};

type CheckoutStepProps = {
	reservationId: number;
};

// Mounts Stripe's hosted (`ui_mode: "embedded_page"`) checkout form inline. The
// reservation is only ever confirmed by stripe-webhook — this just collects payment.
export const CheckoutStep = ({ reservationId }: CheckoutStepProps): FunctionComponent => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let checkout: StripeEmbeddedCheckout | null = null;
		let cancelled = false;

		const setup = async (): Promise<void> => {
			try {
				const stripe = await getStripePromise();
				if (!stripe || cancelled) return;

				checkout = await stripe.createEmbeddedCheckoutPage({
					fetchClientSecret: async () => {
						const { clientSecret } = await createPayment(reservationId);
						return clientSecret;
					},
				});

				if (cancelled) {
					checkout.destroy();
					return;
				}
				if (containerRef.current) {
					checkout.mount(containerRef.current);
				}
			} catch (error_) {
				if (!cancelled) {
					setError(error_ instanceof Error ? error_.message : "Could not start payment");
				}
			}
		};

		void setup();

		return (): void => {
			cancelled = true;
			checkout?.destroy();
		};
	}, [reservationId]);

	if (error) {
		return <p className="text-red-600">{error}</p>;
	}

	return <div ref={containerRef} className="min-h-100" />;
};
