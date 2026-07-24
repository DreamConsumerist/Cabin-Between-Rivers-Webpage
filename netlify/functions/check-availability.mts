import type { Context } from "@netlify/functions";
import { error, json, requireMethod } from "../../lib/http";
import { getBlockedRanges, getSettings } from "../../lib/availability";
import { listPriceOverrides } from "../../lib/priceOverrides";

// GET /api/check-availability -> { blocked: [...], pricing: {...} | null, priceOverrides: [...] }
// The frontend calendar uses `blocked` to disable unavailable dates and
// `pricing` + `priceOverrides` to show an estimated total before the guest
// commits to a booking. Only the public-facing settings fields are returned
// (never the iCal source URLs).
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	try {
		const [blocked, settings, overrides] = await Promise.all([
			getBlockedRanges(),
			getSettings(),
			listPriceOverrides(),
		]);
		return json({
			blocked,
			pricing: settings
				? {
						nightlyRate: settings.nightlyRate,
						cleaningFee: settings.cleaningFee,
						minNights: settings.minNights,
					}
				: null,
			priceOverrides: overrides.map((o) => ({
				checkIn: o.checkIn,
				checkOut: o.checkOut,
				nightlyRate: o.nightlyRate,
				label: o.label,
			})),
		});
	} catch (e) {
		console.error("check-availability failed", e);
		return error("Failed to load availability", 500);
	}
};
