import type { Context } from "@netlify/functions";
import { json, requireMethod } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { listExternalBlocks, listReservations } from "../../lib/availability";
import { listManualBlocks } from "../../lib/manualBlocks";

// GET /api/admin-bookings — reservation list + synced Airbnb/Vrbo blocks +
// admin-created manual blocks for the admin Bookings tab. Admin-gated.
// Deliberately omits `idPhotoBlobKey` (an internal storage key) in favor of
// `hasIdPhoto` — the raw key isn't useful to the frontend, and the photo
// itself is only ever fetched through admin-id-photo.mts.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	const [rows, externalBlocks, manualBlocks] = await Promise.all([
		listReservations(),
		listExternalBlocks(),
		listManualBlocks(),
	]);
	const reservations = rows.map(({ idPhotoBlobKey, ...rest }) => ({
		...rest,
		hasIdPhoto: idPhotoBlobKey != null,
	}));

	return json({ reservations, externalBlocks, manualBlocks });
};
