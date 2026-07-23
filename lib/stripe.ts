import Stripe from "stripe";

let stripeClient: Stripe | null = null;

// Lazily constructed so a missing STRIPE_SECRET_KEY only breaks the functions that
// actually need Stripe (at call time), not every function at dev-server boot.
export const getStripe = (): Stripe => {
    if (stripeClient) return stripeClient;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeClient = new Stripe(secretKey);
    return stripeClient;
};

// Read lazily for the same reason as getStripe().
export const getWebhookSecret = (): string => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    }
    return secret;
};
