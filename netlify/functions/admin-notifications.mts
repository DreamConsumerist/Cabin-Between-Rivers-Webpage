import { z } from "zod";
import { error, json, parseJsonBody, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getSettings, updateNotificationEmails } from "../../lib/availability";

const updateSchema = z.object({
	// Permissive here (not per-address .email() validation) — the client form
	// already validates each comma-separated address, and a malformed one
	// simply won't reach Resend as a valid recipient at send time (logged,
	// not surfaced as a save-time error). See lib/mailer.ts.
	notificationEmails: z.string().trim().or(z.literal("")),
});

// GET/PUT /api/admin-notifications — the business-facing recipient list (see
// lib/mailer.ts) behind the settings table (see db/schema.ts): booking-
// confirmed notices, double-booking warnings, and guest replies. Split out
// from admin-ical.mts since these recipients aren't specific to the iCal
// sync — a new site booking triggers the same list. Developer-facing error
// alerts go through Sentry instead (see lib/sentry.ts). Both methods require
// an admin session.
export default withErrorHandling("admin-notifications", async (req, _context) => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	if (req.method === "GET") {
		const settings = await getSettings();
		return json({ notificationEmails: settings?.notificationEmails ?? "" });
	}

	if (req.method === "PUT") {
		const parsedBody = await parseJsonBody(req);
		if (!parsedBody.ok) return parsedBody.response;

		const parsed = updateSchema.safeParse(parsedBody.body);
		if (!parsed.success)
			return json(
				{ error: "Invalid notification settings", issues: parsed.error.issues },
				400
			);

		const updated = await updateNotificationEmails({
			notificationEmails: parsed.data.notificationEmails || null,
		});
		return json({ notificationEmails: updated.notificationEmails ?? "" });
	}

	return error("Method not allowed", 405);
});
