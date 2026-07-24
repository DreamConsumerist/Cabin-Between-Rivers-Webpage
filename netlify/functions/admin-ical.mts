import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, parseJsonBody } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getSettings, updateIcalUrls } from "../../lib/availability";
import { syncCalendars, type IcalSyncSummary } from "../../lib/icalSync";

const updateSchema = z.object({
	airbnbIcalUrl: z.string().trim().url().or(z.literal("")),
	vrboIcalUrl: z.string().trim().url().or(z.literal("")),
	// Permissive here (not per-address .email() validation) — the client form
	// already validates each comma-separated address, and a malformed one
	// simply won't reach Resend as a valid recipient at send time (logged,
	// not surfaced as a save-time error). See lib/mailer.ts.
	notificationEmails: z.string().trim().or(z.literal("")),
});

// GET/PUT /api/admin-ical — the Airbnb/Vrbo iCal sync URLs and the
// double-booking notification recipients behind the settings table (see
// db/schema.ts). Both methods require an admin session.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	if (req.method === "GET") {
		const settings = await getSettings();
		return json({
			airbnbIcalUrl: settings?.airbnbIcalUrl ?? "",
			vrboIcalUrl: settings?.vrboIcalUrl ?? "",
			notificationEmails: settings?.notificationEmails ?? "",
		});
	}

	if (req.method === "PUT") {
		const parsedBody = await parseJsonBody(req);
		if (!parsedBody.ok) return parsedBody.response;

		const parsed = updateSchema.safeParse(parsedBody.body);
		if (!parsed.success) return json({ error: "Invalid iCal settings", issues: parsed.error.issues }, 400);

		const settings = await updateIcalUrls({
			airbnbIcalUrl: parsed.data.airbnbIcalUrl || null,
			vrboIcalUrl: parsed.data.vrboIcalUrl || null,
			notificationEmails: parsed.data.notificationEmails || null,
		});

		// Sync inline after saving, before responding, so the admin sees fresh
		// blocks immediately — but a save must succeed even if a URL is
		// temporarily unreachable, so a sync failure here is only logged, never
		// returned as a save error.
		let sync: IcalSyncSummary | null = null;
		try {
			sync = await syncCalendars();
		} catch (e) {
			console.error("admin-ical: inline sync after save failed", e);
		}

		return json({
			airbnbIcalUrl: settings.airbnbIcalUrl ?? "",
			vrboIcalUrl: settings.vrboIcalUrl ?? "",
			notificationEmails: settings.notificationEmails ?? "",
			sync,
		});
	}

	return error("Method not allowed", 405);
};
