import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import type { Dayjs } from "dayjs";
import { getSettings } from "./availability";
import { DEFAULT_CHECKIN_INSTRUCTIONS, DEFAULT_CHECKOUT_INSTRUCTIONS } from "./guestEmails";
import { renderTermsHtml } from "./terms";

// timezone depends on utc — see dayjs's own plugin docs, this order matters.
dayjs.extend(utc);
dayjs.extend(timezone);

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

// `html` is optional — notifyDoubleBooking below stays plain text (a rarer,
// already-abnormal alert; no details worth a table for). `text` is always
// sent alongside `html` as the fallback body for clients that don't render it.
// `replyTo` matters because NOTIFICATION_FROM_EMAIL (e.g.
// booking@cabinbetweenrivers.com) is a send-only address with no real inbox
// behind it — Resend is send-only too — so without this, a guest hitting
// "reply" would go nowhere. sendBookingConfirmationEmail below sets it to the
// admin's own configured notificationEmails so replies land there instead.
export type SendEmailInput = {
	to: string[];
	subject: string;
	text: string;
	html?: string;
	replyTo?: string[];
	// ISO 8601 UTC timestamp — Resend delivers at this instant instead of
	// immediately (see scheduleCheckInReminder/scheduleCheckOutReminder
	// below). Omitted entirely for every other caller, which sends right away.
	scheduledAt?: string;
};

// Minimal Resend REST call — no SDK, matching this codebase's lean-dependency
// style (this is the only third-party HTTP call in the app made via plain
// fetch rather than an SDK; see lib/stripe.ts for the SDK-based alternative).
// Throws on a non-2xx response — every caller in this file wraps its own call
// in try/catch and is responsible for never letting that propagate further.
export const sendEmail = async ({
	to,
	subject,
	text,
	html,
	replyTo,
	scheduledAt,
}: SendEmailInput): Promise<{ id: string }> => {
	const apiKey = getEnv("RESEND_API_KEY");
	const from = getEnv("NOTIFICATION_FROM_EMAIL");

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			from,
			to,
			subject,
			text,
			...(html ? { html } : {}),
			...(replyTo && replyTo.length > 0 ? { reply_to: replyTo } : {}),
			...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Resend API error ${response.status}: ${body}`);
	}

	return response.json() as Promise<{ id: string }>;
};

// POST /emails/{id}/cancel — aborts a still-pending scheduled send (e.g. a
// reservation was cancelled before its check-in reminder went out). A no-op
// from Resend's side if the email already sent or was already cancelled.
// Never throws (log + swallow) — same contract as every other notify*/send*
// helper in this file: cancelling a reminder must never break the
// cancellation/refund flow that triggered it.
export const cancelScheduledEmail = async (emailId: string): Promise<void> => {
	try {
		const apiKey = getEnv("RESEND_API_KEY");
		const response = await fetch(`https://api.resend.com/emails/${emailId}/cancel`, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Resend cancel API error ${response.status}: ${body}`);
		}
	} catch (e) {
		console.error(`cancelScheduledEmail: failed to cancel ${emailId}`, e);
	}
};

// Every HTML email body interpolates guest-supplied free text (guestName —
// see src/features/booking/schema.ts) or reservation data, so it needs
// escaping same as lib/terms.ts's admin-authored content does.
const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

// Shared outer card shell for every HTML email — table-based layout with
// every style inline, since email clients (Outlook desktop most of all)
// don't reliably support flexbox/grid or a <style> block.
const emailShell = (bodyHtml: string): string => `<!doctype html>
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
								${bodyHtml}
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;

// One label/value row in a details table — `withDivider` marks the last row
// (e.g. "Amount paid") off from the ones above it.
const emailDetailRow = (label: string, value: string, withDivider = false): string => `
	<tr>
		<td style="padding:6px 0;color:#666666;${withDivider ? "border-top:1px solid #eaeaea;" : ""}">${label}</td>
		<td style="padding:6px 0;text-align:right;font-weight:600;color:#333333;${withDivider ? "border-top:1px solid #eaeaea;" : ""}">${value}</td>
	</tr>`;

export type BookingConfirmedDetails = {
	reservationId: number;
	guestName: string;
	guestEmail: string;
	checkIn: string;
	checkOut: string;
	guests: number;
	// Cents, matching reservations.amountTotal (see db/schema.ts).
	amountTotal: number;
	// Absolute, already admin-gated (see admin-id-photo.mts) — null if the
	// guest never uploaded one. Only relevant to the admin notification below;
	// the guest's own confirmation email has no reason to reference it.
	idPhotoUrl: string | null;
	// Absolute, token-gated (see cancel-my-reservation.mts) — the guest's own
	// self-cancel link. Only relevant to the guest confirmation email below;
	// the admin notification has no reason to reference it (the admin cancels
	// from /admin instead).
	cancellationUrl: string;
};

const adminBookingConfirmedHtml = (details: BookingConfirmedDetails): string => {
	const checkIn = dayjs(details.checkIn).format("MMM D, YYYY");
	const checkOut = dayjs(details.checkOut).format("MMM D, YYYY");
	const amount = (details.amountTotal / 100).toFixed(2);
	const idPhoto = details.idPhotoUrl
		? `<a href="${escapeHtml(details.idPhotoUrl)}" style="color:#5c871f;">View photo ID</a>`
		: "Not uploaded";

	return emailShell(`
		<p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#3d5817;">New booking confirmed</p>
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
			${emailDetailRow("Reservation", `#${details.reservationId}`)}
			${emailDetailRow("Guest", `${escapeHtml(details.guestName)} (${escapeHtml(details.guestEmail)})`)}
			${emailDetailRow("Dates", `${checkIn} &ndash; ${checkOut}`)}
			${emailDetailRow("Guests", String(details.guests))}
			${emailDetailRow("Photo ID", idPhoto)}
			${emailDetailRow("Amount paid", `$${amount}`, true)}
		</table>
		<p style="margin:24px 0 0;font-size:15px;color:#333333;line-height:1.5;">
			View it in /admin.
		</p>
	`);
};

// Never throws — same contract as notifyDoubleBooking below, since a failed
// or unconfigured notification must never break the Stripe webhook that just
// confirmed the payment.
export const notifyBookingConfirmed = async (details: BookingConfirmedDetails): Promise<void> => {
	try {
		const settings = await getSettings();
		const recipients = parseNotificationEmails(settings?.notificationEmails);
		if (recipients.length === 0) return;

		const subject = `New booking #${details.reservationId}: ${details.checkIn} to ${details.checkOut}`;
		const text = [
			"A new booking was just confirmed.",
			`Reservation ID: #${details.reservationId}`,
			`Guest: ${details.guestName} (${details.guestEmail})`,
			`Dates: ${details.checkIn} to ${details.checkOut}`,
			`Guests: ${details.guests}`,
			`Photo ID: ${details.idPhotoUrl ?? "Not uploaded"}`,
			`Amount paid: $${(details.amountTotal / 100).toFixed(2)}`,
			"View it in /admin.",
		].join("\n");

		await sendEmail({
			to: recipients,
			subject,
			text,
			html: adminBookingConfirmedHtml(details),
		});
	} catch (e) {
		console.error("notifyBookingConfirmed: failed to send notification", e);
	}
};

const bookingConfirmationHtml = (details: BookingConfirmedDetails): string => {
	const checkIn = dayjs(details.checkIn).format("MMM D, YYYY");
	const checkOut = dayjs(details.checkOut).format("MMM D, YYYY");
	const amount = (details.amountTotal / 100).toFixed(2);

	return emailShell(`
		<p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#3d5817;">You're booked!</p>
		<p style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.5;">
			Hi ${escapeHtml(details.guestName)}, your reservation is confirmed. Here are the details:
		</p>
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
			${emailDetailRow("Dates", `${checkIn} &ndash; ${checkOut}`)}
			${emailDetailRow("Guests", String(details.guests))}
			${emailDetailRow("Amount paid", `$${amount}`, true)}
		</table>
		<p style="margin:24px 0 0;font-size:15px;color:#333333;line-height:1.5;">
			We look forward to hosting you.
		</p>
		<p style="margin:16px 0 0;font-size:13px;color:#666666;line-height:1.5;">
			Need to cancel? <a href="${escapeHtml(details.cancellationUrl)}" style="color:#5c871f;">Cancel my reservation</a>.
		</p>
	`);
};

// Sent straight to the guest — unlike notifyBookingConfirmed above, this
// doesn't depend on settings.notificationEmails to pick a recipient (every
// reservation already has its own guestEmail), but it does read it for
// replyTo: NOTIFICATION_FROM_EMAIL is a send-only address, so without this a
// guest hitting "reply" would go nowhere instead of back to the admin. Never
// throws — same contract as notifyBookingConfirmed: a failed send must not
// break the Stripe webhook that already confirmed the payment.
export const sendBookingConfirmationEmail = async (
	details: BookingConfirmedDetails
): Promise<void> => {
	try {
		const settings = await getSettings();
		const replyTo = parseNotificationEmails(settings?.notificationEmails);

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
			"",
			`Need to cancel? ${details.cancellationUrl}`,
		].join("\n");

		await sendEmail({
			to: [details.guestEmail],
			subject,
			text,
			html: bookingConfirmationHtml(details),
			replyTo,
		});
	} catch (e) {
		console.error("sendBookingConfirmationEmail: failed to send guest confirmation", e);
	}
};

export type CancellationDetails = {
	guestName: string;
	guestEmail: string;
	checkIn: string;
	checkOut: string;
	// Cents, matching reservations.amountTotal — only meaningful when
	// `refunded` is true (the amount actually returned); ignored otherwise,
	// since an unrefunded cancellation never charged the guest anything.
	amountTotal: number;
	refunded: boolean;
};

const cancellationHtml = (details: CancellationDetails): string => {
	const checkIn = dayjs(details.checkIn).format("MMM D, YYYY");
	const checkOut = dayjs(details.checkOut).format("MMM D, YYYY");
	const amount = (details.amountTotal / 100).toFixed(2);

	return emailShell(`
		<p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#3d5817;">Reservation cancelled</p>
		<p style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.5;">
			Hi ${escapeHtml(details.guestName)}, your reservation has been cancelled.
			${details.refunded ? "A full refund has been issued to your original payment method." : "You were not charged."}
		</p>
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
			${emailDetailRow("Dates", `${checkIn} &ndash; ${checkOut}`, !details.refunded)}
			${details.refunded ? emailDetailRow("Refunded", `$${amount}`, true) : ""}
		</table>
		<p style="margin:24px 0 0;font-size:15px;color:#333333;line-height:1.5;">
			${
				details.refunded
					? "Refunds typically take 5&ndash;10 business days to appear, depending on your bank."
					: "Questions about this cancellation? Just reply to this email."
			}
		</p>
	`);
};

// Sent straight to the guest, same reasoning as sendBookingConfirmationEmail
// above (replyTo since NOTIFICATION_FROM_EMAIL is send-only; never throws so
// a failed send can't break the cancel/refund action that triggered it).
// `refunded` picks the wording rather than needing a separate function per
// outcome — the guest-facing shape is otherwise identical either way. Two
// callers, both gated to a reservation that was CONFIRMED (paid) before
// cancelling, never a still-pending hold — a guest who never finished
// booking shouldn't get a "your reservation was cancelled" email for
// something they never completed: admin-cancel-reservation.mts (admin-
// initiated) and cancel-my-reservation.mts (guest self-service). In practice
// this means refunded is always true from both — a confirmed reservation
// always has a payment to refund, and a failed refund attempt aborts before
// reaching this call at all — the false branch exists for a
// still-charged-nothing outcome should one ever route here, not dead code so
// much as not-yet-exercised.
export const sendCancellationEmail = async (details: CancellationDetails): Promise<void> => {
	try {
		const settings = await getSettings();
		const replyTo = parseNotificationEmails(settings?.notificationEmails);

		const subject = details.refunded
			? "Your Cabin Between Rivers reservation was cancelled and refunded"
			: "Your Cabin Between Rivers reservation was cancelled";
		const text = [
			`Hi ${details.guestName},`,
			"",
			`Your reservation has been cancelled. ${
				details.refunded
					? "A full refund has been issued to your original payment method."
					: "You were not charged."
			}`,
			`Dates: ${details.checkIn} to ${details.checkOut}`,
			...(details.refunded ? [`Refunded: $${(details.amountTotal / 100).toFixed(2)}`] : []),
			"",
			details.refunded
				? "Refunds typically take 5-10 business days to appear, depending on your bank."
				: "Questions about this cancellation? Just reply to this email.",
		].join("\n");

		await sendEmail({
			to: [details.guestEmail],
			subject,
			text,
			html: cancellationHtml(details),
			replyTo,
		});
	} catch (e) {
		console.error("sendCancellationEmail: failed to send guest cancellation notice", e);
	}
};

export type GuestCancellationDetails = {
	reservationId: number;
	guestName: string;
	guestEmail: string;
	checkIn: string;
	checkOut: string;
	amountTotal: number;
};

// Admin-facing counterpart to sendCancellationEmail above — fires only when
// the GUEST initiates their own cancellation (cancel-my-reservation.mts),
// since an admin-initiated one already means the admin was there for it.
// Plain text like notifyDoubleBooking below, not the full HTML card
// treatment — this is an ops alert (money just left without the admin's own
// action), not a guest-facing surface. Never throws — same contract as every
// other notify* function here: a failed/unconfigured alert must never break
// the refund that already went through.
export const notifyGuestCancellation = async (details: GuestCancellationDetails): Promise<void> => {
	try {
		const settings = await getSettings();
		const recipients = parseNotificationEmails(settings?.notificationEmails);
		if (recipients.length === 0) return;

		const subject = `Guest cancelled reservation #${details.reservationId}`;
		const text = [
			"A guest cancelled their own reservation and was refunded in full.",
			`Reservation ID: #${details.reservationId}`,
			`Guest: ${details.guestName} (${details.guestEmail})`,
			`Dates: ${details.checkIn} to ${details.checkOut}`,
			`Refunded: $${(details.amountTotal / 100).toFixed(2)}`,
			"View it in /admin.",
		].join("\n");

		await sendEmail({ to: recipients, subject, text });
	} catch (e) {
		console.error("notifyGuestCancellation: failed to send notification", e);
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

// --- Guest arrival/departure reminders (scheduled via Resend, no polling cron) ---
//
// Rather than a cron that periodically checks "is anyone checking in soon,"
// each reminder is scheduled with Resend's own scheduled_at at the earliest
// point it's known to be needed: right when a booking is confirmed (see
// stripe-webhook.mts), for the common case where check-in is soon. Resend
// caps scheduled_at at 30 days out, so a booking made further ahead than that
// can't be scheduled yet — netlify/functions/schedule-guest-emails.mts sweeps
// for those every two weeks and schedules them once they enter the window.
// reservations.checkInEmailId/checkOutEmailId (see db/schema.ts) record the
// Resend email id once scheduled, so both paths can skip a reservation that's
// already been handled.

// The cabin is in Alaska. Per this project's timezone convention (see
// SETUP.md): internal time handling stays in UTC everywhere; anything a user
// or admin sets or views is in AKST. settings.checkInReminderHour/
// checkOutReminderHour (below) are the concrete example — an admin-set AKST
// wall-clock hour, converted to UTC only where scheduled_at is computed.
const CABIN_TIMEZONE = "America/Anchorage";
const DEFAULT_CHECKIN_REMINDER_HOUR = 9;
const DEFAULT_CHECKOUT_REMINDER_HOUR = 8;
const CHECKIN_REMINDER_LEAD_DAYS = 2;
// One day of margin under Resend's exact 30-day scheduling cap, so clock
// drift or a slightly-late cron run never gets rejected as "too far out."
const MAX_SCHEDULE_DAYS = 29;

export type GuestReminderReservation = {
	id: number;
	guestName: string;
	guestEmail: string;
	checkIn: string;
	checkOut: string;
};

export type GuestEmailSettings = {
	checkInInstructions: string | null;
	checkOutInstructions: string | null;
	checkInReminderHour: number | null;
	checkOutReminderHour: number | null;
};

type ScheduleDecision = { kind: "schedule"; scheduledAt: string } | { kind: "skip" };

// `idealLocal` is the target send time (already at the configured AKST hour).
// `eventDate` is the check-in/check-out date itself, used only to detect a
// stay that's already fully over — once past the end of that day (AKST),
// there's nothing useful left to remind anyone about.
const decideScheduleTime = (idealLocal: Dayjs, eventDate: string): ScheduleDecision => {
	const now = dayjs();
	const eventCutoff = dayjs.tz(eventDate, CABIN_TIMEZONE).endOf("day");
	if (eventCutoff.isBefore(now)) return { kind: "skip" };

	// The ideal lead time already passed (e.g. a far-out booking only just
	// picked up by the twice-monthly sweep, with days to spare before check-in
	// but not the full intended lead time) — better a late reminder than none.
	if (idealLocal.isBefore(now)) {
		return { kind: "schedule", scheduledAt: now.add(5, "minute").toISOString() };
	}
	if (idealLocal.diff(now, "day") > MAX_SCHEDULE_DAYS) return { kind: "skip" };
	return { kind: "schedule", scheduledAt: idealLocal.toISOString() };
};

const checkInReminderHtml = (reservation: GuestReminderReservation, instructions: string): string => {
	const checkIn = dayjs(reservation.checkIn).format("MMM D, YYYY");
	return emailShell(`
		<p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#3d5817;">Your check-in is coming up</p>
		<p style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.5;">
			Hi ${escapeHtml(reservation.guestName)}, your check-in (${checkIn}) is almost here.
		</p>
		<div style="font-size:15px;color:#333333;line-height:1.5;">${renderTermsHtml(instructions)}</div>
	`);
};

const checkOutReminderHtml = (reservation: GuestReminderReservation, instructions: string): string => {
	const checkOut = dayjs(reservation.checkOut).format("MMM D, YYYY");
	return emailShell(`
		<p style="margin:0 0 16px;font-size:22px;font-weight:600;color:#3d5817;">Check-out is today</p>
		<p style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.5;">
			Hi ${escapeHtml(reservation.guestName)}, thanks for staying with us! Your check-out (${checkOut}) is today.
		</p>
		<div style="font-size:15px;color:#333333;line-height:1.5;">${renderTermsHtml(instructions)}</div>
	`);
};

// Schedules the arrival-instructions reminder via Resend's scheduled_at (2
// days before check-in, at the admin-configured AKST hour) and returns the
// Resend email id to persist on the reservation row — or null if it
// shouldn't be scheduled (yet): the stay is already over, or check-in is
// further out than Resend's scheduling window allows (the twice-monthly cron
// will retry once it's in range). Never throws — same "must not break the
// caller" contract as notifyBookingConfirmed above, since both
// stripe-webhook.mts and the cron treat this as best-effort.
export const scheduleCheckInReminder = async (
	reservation: GuestReminderReservation,
	settings: GuestEmailSettings | null
): Promise<string | null> => {
	try {
		const hour = settings?.checkInReminderHour ?? DEFAULT_CHECKIN_REMINDER_HOUR;
		const idealLocal = dayjs
			.tz(reservation.checkIn, CABIN_TIMEZONE)
			.subtract(CHECKIN_REMINDER_LEAD_DAYS, "day")
			.hour(hour)
			.minute(0)
			.second(0)
			.millisecond(0);
		const decision = decideScheduleTime(idealLocal, reservation.checkIn);
		if (decision.kind === "skip") return null;

		const instructions = settings?.checkInInstructions?.trim() || DEFAULT_CHECKIN_INSTRUCTIONS;
		const checkIn = dayjs(reservation.checkIn).format("MMM D, YYYY");
		const { id } = await sendEmail({
			to: [reservation.guestEmail],
			subject: `Your check-in (${checkIn}) is coming up`,
			text: `Hi ${reservation.guestName},\n\nYour check-in (${checkIn}) is almost here.\n\n${instructions}`,
			html: checkInReminderHtml(reservation, instructions),
			scheduledAt: decision.scheduledAt,
		});
		return id;
	} catch (e) {
		console.error(`scheduleCheckInReminder: failed for reservation ${reservation.id}`, e);
		return null;
	}
};

// Schedules the pre-checkout reminder via Resend's scheduled_at (the morning
// of check-out, at the admin-configured AKST hour) — same contract as
// scheduleCheckInReminder above (never throws, returns null when not (yet)
// schedulable).
export const scheduleCheckOutReminder = async (
	reservation: GuestReminderReservation,
	settings: GuestEmailSettings | null
): Promise<string | null> => {
	try {
		const hour = settings?.checkOutReminderHour ?? DEFAULT_CHECKOUT_REMINDER_HOUR;
		const idealLocal = dayjs
			.tz(reservation.checkOut, CABIN_TIMEZONE)
			.hour(hour)
			.minute(0)
			.second(0)
			.millisecond(0);
		const decision = decideScheduleTime(idealLocal, reservation.checkOut);
		if (decision.kind === "skip") return null;

		const instructions = settings?.checkOutInstructions?.trim() || DEFAULT_CHECKOUT_INSTRUCTIONS;
		const checkOut = dayjs(reservation.checkOut).format("MMM D, YYYY");
		const { id } = await sendEmail({
			to: [reservation.guestEmail],
			subject: "Check-out is today — a few things before you go",
			text: `Hi ${reservation.guestName},\n\nThanks for staying with us! Your check-out (${checkOut}) is today.\n\n${instructions}`,
			html: checkOutReminderHtml(reservation, instructions),
			scheduledAt: decision.scheduledAt,
		});
		return id;
	} catch (e) {
		console.error(`scheduleCheckOutReminder: failed for reservation ${reservation.id}`, e);
		return null;
	}
};

// Cancels whichever of a reservation's scheduled reminders were already
// scheduled (either may be null — e.g. cancelled before the check-out
// reminder's own booking-time scheduling attempt succeeded). Called from
// both cancellation flows (cancel-my-reservation.mts,
// admin-cancel-reservation.mts) right after the cancellation itself succeeds.
export const cancelGuestReminderEmails = async (reservation: {
	checkInEmailId: string | null;
	checkOutEmailId: string | null;
}): Promise<void> => {
	await Promise.all(
		[reservation.checkInEmailId, reservation.checkOutEmailId]
			.filter((id): id is string => id !== null)
			.map((id) => cancelScheduledEmail(id))
	);
};
