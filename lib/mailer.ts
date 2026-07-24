import { getSettings } from "./availability";

// Read lazily, same reasoning as lib/adminAuth.ts's getEnv — a missing key
// should only break the send path, not every function at boot.
const getEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

// settings.notificationEmails is stored as one comma-separated string (see
// db/schema.ts) — this is the single place that turns it into a list.
export const parseNotificationEmails = (raw: string | null | undefined): string[] =>
	(raw ?? "")
		.split(",")
		.map((email) => email.trim())
		.filter((email) => email.length > 0);

export type SendEmailInput = { to: string[]; subject: string; text: string };

// Minimal Resend REST call — no SDK, matching this codebase's lean-dependency
// style (this is the only third-party HTTP call in the app made via plain
// fetch rather than an SDK; see lib/stripe.ts for the SDK-based alternative).
// Throws on a non-2xx response; notifyDoubleBooking below is the only caller
// and is responsible for never letting that propagate to ITS caller.
export const sendEmail = async ({ to, subject, text }: SendEmailInput): Promise<void> => {
	const apiKey = getEnv("RESEND_API_KEY");
	const from = getEnv("NOTIFICATION_FROM_EMAIL");

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ from, to, subject, text }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Resend API error ${response.status}: ${body}`);
	}
};

export type DoubleBookingDetails = {
	source: "airbnb-sync" | "vrbo-sync" | "stripe-webhook";
	checkIn: string;
	checkOut: string;
	// Caller-specific context (e.g. the external block's uid and the
	// conflicting reservation id(s) for the sync path, or the reservation id
	// and Stripe event id for the webhook path).
	detail: string;
};

// Never throws — a failed or unconfigured notification must never break the
// iCal sync or the Stripe webhook that detected the conflict. Two distinct
// non-error cases: no settings.notificationEmails configured is a silent
// no-op (the feature just isn't turned on yet); a missing RESEND_API_KEY/
// NOTIFICATION_FROM_EMAIL or a failed Resend call is logged loudly so it's
// visible in Netlify function logs, but still swallowed. Callers invoke this
// unguarded — this function owns "never break the caller" itself rather than
// each call site duplicating a try/catch.
export const notifyDoubleBooking = async (details: DoubleBookingDetails): Promise<void> => {
	try {
		const settings = await getSettings();
		const recipients = parseNotificationEmails(settings?.notificationEmails);
		if (recipients.length === 0) return;

		const subject = `Double-booking conflict detected (${details.source})`;
		const text = [
			"A potential double-booking was detected.",
			`Source: ${details.source}`,
			`Dates: ${details.checkIn} to ${details.checkOut}`,
			details.detail,
			"Please reconcile manually in /admin.",
		].join("\n");

		await sendEmail({ to: recipients, subject, text });
	} catch (e) {
		console.error("notifyDoubleBooking: failed to send notification", e);
	}
};
