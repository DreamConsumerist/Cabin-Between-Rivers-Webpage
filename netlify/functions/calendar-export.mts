import { constantTimeEquals } from "../../lib/adminAuth";
import { getExportableBlocks, getSettings } from "../../lib/availability";
import { withErrorHandling } from "../../lib/http";
import { buildBlocksIcs } from "../../lib/icalExport";

// GET /api/calendar-export.ics?token=... (also reachable as /api/calendar-export
// without the extension — see netlify.toml) — public .ics feed of this site's own
// bookings and manual blocks (reservations + manual_blocks tables — NOT
// externalBlocks, so Airbnb/Vrbo's own bookings never echo back to
// themselves). Token-gated instead of
// session-gated: Airbnb/Vrbo poll this with no cookies. Any missing/mismatched
// token 404s (not 401/403) so a guesser can't distinguish "wrong token" from
// "nothing here". Must call plain getSettings(), never getOrCreateExportToken
// — an unauthenticated request must never be able to mint a token as a side
// effect.
export default withErrorHandling("calendar-export", async (req, _context) => {
	if (req.method !== "GET") return new Response("Not found", { status: 404 });

	const token = new URL(req.url).searchParams.get("token") ?? "";
	const settings = await getSettings();
	if (
		!settings?.exportToken ||
		!token ||
		!constantTimeEquals(token, settings.exportToken)
	) {
		return new Response("Not found", { status: 404 });
	}

	const ics = buildBlocksIcs(await getExportableBlocks());
	return new Response(ics, {
		status: 200,
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			"content-disposition": 'attachment; filename="cabin-between-rivers.ics"',
			"cache-control": "no-store",
		},
	});
});
