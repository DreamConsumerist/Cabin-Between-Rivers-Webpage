import type { Context } from "@netlify/functions";
import { error, json, requireMethod } from "../../lib/http";
import { getBlockedRanges } from "../../lib/availability";

// GET /api/check-availability -> { blocked: [{ checkIn, checkOut, source }] }
// The frontend calendar uses these ranges to disable unavailable dates.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	try {
		const blocked = await getBlockedRanges();
		return json({ blocked });
	} catch (e) {
		console.error("check-availability failed", e);
		return error("Failed to load availability", 500);
	}
};
