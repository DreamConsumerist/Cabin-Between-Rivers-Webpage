import type { Context } from "@netlify/functions";
import { json, requireMethod } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { listReservations } from "../../lib/availability";

// GET /api/admin-bookings — reservation list for the admin Bookings tab.
// Admin-gated. Deliberately omits `idPhotoBlobKey` (an internal storage key)
// in favor of `hasIdPhoto` — the raw key isn't useful to the frontend, and the
// photo itself is only ever fetched through admin-id-photo.mts.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	const rows = await listReservations();
	const reservations = rows.map(({ idPhotoBlobKey, ...rest }) => ({
		...rest,
		hasIdPhoto: idPhotoBlobKey != null,
	}));

	return json({ reservations });
};
