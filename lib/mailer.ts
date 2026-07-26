import dayjs from "dayjs";
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

// `html` is optional — the admin alert emails below stay plain text (they're
// functional ops notifications, not a guest-facing surface), while
// sendBookingConfirmationEmail supplies one. `text` is always sent alongside
// it as the fallback body for clients that don't render HTML.
export type SendEmailInput = { to: string[]; subject: string; text: string; html?: string };

// Minimal Resend REST call — no SDK, matching this codebase's lean-dependency
// style (this is the only third-party HTTP call in the app made via plain
// fetch rather than an SDK; see lib/stripe.ts for the SDK-based alternative).
// Throws on a non-2xx response; notifyDoubleBooking below is the only caller
// and is responsible for never letting that propagate to ITS caller.
export const sendEmail = async ({ to, subject, text, html }: SendEmailInput): Promise<void> => {
	const apiKey = getEnv("RESEND_API_KEY");
	const from = getEnv("NOTIFICATION_FROM_EMAIL");

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}) }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Resend API error ${response.status}: ${body}`);
	}
};

// Guest-facing email bodies interpolate guestName (free-text guest input —
// see src/features/booking/schema.ts) into HTML, so it needs escaping same as
// lib/terms.ts's admin-authored content does.
const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

export type BookingConfirmedDetails = {
	guestName: string;
	guestEmail: string;
	checkIn: string;
	checkOut: string;
	guests: number;
	// Cents, matching reservations.amountTotal (see db/schema.ts).
	amountTotal: number;
};

// Never throws — same contract as notifyDoubleBooking below, since a failed
// or unconfigured notification must never break the Stripe webhook that just
// confirmed the payment.
export const notifyBookingConfirmed = async (details: BookingConfirmedDetails): Promise<void> => {
	try {
		const settings = await getSettings();
		const recipients = parseNotificationEmails(settings?.notificationEmails);
		if (recipients.length === 0) return;

		const subject = `New booking: ${details.checkIn} to ${details.checkOut}`;
		const text = [
			"A new booking was just confirmed.",
			`Guest: ${details.guestName} (${details.guestEmail})`,
			`Dates: ${details.checkIn} to ${details.checkOut}`,
			`Guests: ${details.guests}`,
			`Amount paid: $${(details.amountTotal / 100).toFixed(2)}`,
			"View it in /admin.",
		].join("\n");

		await sendEmail({ to: recipients, subject, text });
	} catch (e) {
		console.error("notifyBookingConfirmed: failed to send notification", e);
	}
};

// Table-based layout with every style inline — email clients (Outlook desktop
// most of all) don't reliably support flexbox/grid or a <style> block, so this
// avoids both rather than degrading gracefully in just some of them.
const bookingConfirmationHtml = (details: BookingConfirmedDetails): string => {
	const checkIn = dayjs(details.checkIn).format("MMM D, YYYY");
	const checkOut = dayjs(details.checkOut).format("MMM D, YYYY");
	const amount = (details.amountTotal / 100).toFixed(2);
	const row = (label: string, value: string, withDivider = false): string => `
		<tr>
			<td style="padding:6px 0;color:#666666;${withDivider ? "border-top:1px solid #eaeaea;" : ""}">${label}</td>
			<td style="padding:6px 0;text-align:right;font-weight:600;color:#333333;${withDivider ? "border-top:1px solid #eaeaea;" : ""}">${value}</td>
		</tr>`;

	return `<!doctype html>
<html>
	<body style="margin:0;padding:0;background-color:#f5f8f1;font-family:Georgia,'Times New Roman',serif;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f8f1;padding:32px 16px;">
			<tr>
				<td align="center">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eaf1df;">
						<tr>
							<td style="background-color:#5c871f;padding:24px 32px;">
								<span style="color:#ffffff;font-size:20px;font-weight:600;">Cabin Between Rivers</span>
							</td>
						</tr>
						<tr>
							<td style="padding:32px;">
								<p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#3d5817;">You're booked!</p>
								<p style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.5;">
									Hi ${escapeHtml(details.guestName)}, your reservation is confirmed. Here are the details:
								</p>
								<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
									${row("Dates", `${checkIn} &ndash; ${checkOut}`)}
									${row("Guests", String(details.guests))}
									${row("Amount paid", `$${amount}`, true)}
								</table>
								<p style="margin:24px 0 0;font-size:15px;color:#333333;line-height:1.5;">
									We look forward to hosting you.
								</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;
};

// Sent straight to the guest — unlike notifyBookingConfirmed above, this
// doesn't depend on settings.notificationEmails, since every reservation
// already has its own guestEmail. Never throws — same contract as
// notifyBookingConfirmed: a failed send must not break the Stripe webhook
// that already confirmed the payment.
export const sendBookingConfirmationEmail = async (
	details: BookingConfirmedDetails
): Promise<void> => {
	try {
		const subject = "Your Cabin Between Rivers reservation is confirmed";
		const text = [
			`Hi ${details.guestName},`,
			"",
			"Your reservation is confirmed! Here are the details:",
			`Dates: ${details.checkIn} to ${details.checkOut}`,
			`Guests: ${details.guests}`,
			`Amount paid: $${(details.amountTotal / 100).toFixed(2)}`,
			"",
			"We look forward to hosting you.",
		].join("\n");

		await sendEmail({
			to: [details.guestEmail],
			subject,
			text,
			html: bookingConfirmationHtml(details),
		});
	} catch (e) {
		console.error("sendBookingConfirmationEmail: failed to send guest confirmation", e);
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
