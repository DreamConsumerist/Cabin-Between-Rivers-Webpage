import { json, requireMethod, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { regenerateExportToken } from "../../lib/availability";

// POST /api/admin-ical-export-token — regenerates the export feed's secret
// token, invalidating the old feed URL. Separate from admin-ical.mts (whose
// GET/PUT own the *import* URLs + notification emails) because this is the
// opposite direction of data flow and isn't part of that form's submit — same
// relationship admin-ical-sync.mts has to admin-ical.mts today.
export default withErrorHandling("admin-ical-export-token", async (req, _context) => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	const exportToken = await regenerateExportToken();
	return json({
		exportToken,
		exportUrl: `${new URL(req.url).origin}/api/calendar-export.ics?token=${exportToken}`,
	});
});
