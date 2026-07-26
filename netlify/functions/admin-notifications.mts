import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, parseJsonBody } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getSettings, updateNotificationEmails } from "../../lib/availability";

const updateSchema = z.object({
	// Permissive here (not per-address .email() validation) — the client form
	// already validates each comma-separated address, and a malformed one
	// simply won't reach Resend as a valid recipient at send time (logged,
	// not surfaced as a save-time error). See lib/mailer.ts.
	notificationEmails: z.string().trim().or(z.literal("")),
});

// GET/PUT /api/admin-notifications — the recipient list (see lib/mailer.ts)
// for the booking-confirmed and double-booking-warning emails, behind the
// settings table (see db/schema.ts). Split out from admin-ical.mts since these
// recipients aren't specific to the iCal sync — a new site booking triggers
// the same list. Both methods require an admin session.
export default async (req: Request, _context: Context): Promise<Response> => {
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

		const updated = await updateNotificationEmails(parsed.data.notificationEmails || null);
		return json({ notificationEmails: updated.notificationEmails ?? "" });
	}

	return error("Method not allowed", 405);
};
