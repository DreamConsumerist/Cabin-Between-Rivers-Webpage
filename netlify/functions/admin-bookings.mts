import { json, requireMethod, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { expireLapsedHolds, listExternalBlocks, listReservations } from "../../lib/availability";
import { listConfigurations } from "../../lib/bookingConfigurations";
import { listManualBlocks } from "../../lib/manualBlocks";

// GET /api/admin-bookings — reservation list + synced Airbnb/Vrbo blocks +
// admin-created manual blocks for the admin Bookings tab. Admin-gated.
// Deliberately omits `idPhotoBlobKey` (an internal storage key) in favor of
// `hasIdPhoto` — the raw key isn't useful to the frontend, and the photo
// itself is only ever fetched through admin-id-photo.mts.
export default withErrorHandling("admin-bookings", async (req, _context) => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	// No scheduled cron does this cleanup (removed — see git history): a lapsed
	// hold already can't block availability or the EXCLUDE constraint (see
	// activeReservation() in lib/availability.ts), and create-booking expires
	// lapsed holds on demand before it needs them cleared. The only thing that
	// cares about the stale `pending` status is this admin list's display, so
	// it's cleared here, on demand, rather than on a timer that would otherwise
	// keep the database compute running around the clock for no benefit.
	await expireLapsedHolds();

	const [rows, externalBlocks, manualBlocks, configurations] = await Promise.all([
		listReservations(),
		listExternalBlocks(),
		listManualBlocks(),
		listConfigurations(),
	]);
	const configurationNames = new Map(configurations.map((c) => [c.id, c.name]));
	const reservations = rows.map(({ idPhotoBlobKey, ...rest }) => ({
		...rest,
		hasIdPhoto: idPhotoBlobKey != null,
		configurationName: configurationNames.get(rest.configurationId) ?? null,
	}));

	return json({ reservations, externalBlocks, manualBlocks });
});
