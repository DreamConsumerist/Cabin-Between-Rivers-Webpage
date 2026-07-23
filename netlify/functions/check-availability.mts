import type { Context } from "@netlify/functions";
import { error, json, requireMethod } from "../../lib/http";
import { getBlockedRanges, getSettings } from "../../lib/availability";

// GET /api/check-availability -> { blocked: [...], pricing: {...} | null }
// The frontend calendar uses `blocked` to disable unavailable dates and `pricing`
// to show an estimated total before the guest commits to a booking. Only the
// public-facing settings fields are returned (never the iCal source URLs).
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	try {
		const [blocked, settings] = await Promise.all([getBlockedRanges(), getSettings()]);
		return json({
			blocked,
			pricing: settings
				? {
						nightlyRate: settings.nightlyRate,
						cleaningFee: settings.cleaningFee,
						minNights: settings.minNights,
					}
				: null,
		});
	} catch (e) {
		console.error("check-availability failed", e);
		return error("Failed to load availability", 500);
	}
};
