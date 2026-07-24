import type { Context } from "@netlify/functions";
import { error, json, requireMethod } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { syncCalendars } from "../../lib/icalSync";

// POST /api/admin-ical-sync — manual "Sync now" trigger for the admin iCal
// tab, independent of saving URLs (compare admin-ical.mts's PUT, which also
// syncs inline after a save). Both go through lib/icalSync.syncCalendars —
// this file is a thin trigger, not a second implementation.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	try {
		const summary = await syncCalendars();
		return json(summary);
	} catch (e) {
		console.error("admin-ical-sync: sync failed", e);
		return error("Sync failed", 500);
	}
};
