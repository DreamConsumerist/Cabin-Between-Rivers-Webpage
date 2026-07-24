import type { Context } from "@netlify/functions";
import { error, requireMethod } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getReservationById } from "../../lib/availability";
import { getIdPhotoBlob } from "../../lib/blobs";

// GET /api/admin-id-photo?reservationId=<id> -> streams the guest's uploaded
// photo ID. Admin-gated — this is sensitive PII, unlike the public
// gallery-image.mts. Never cached (private, no-store) for the same reason.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	const reservationId = Number(new URL(req.url).searchParams.get("reservationId"));
	if (!Number.isInteger(reservationId) || reservationId <= 0) {
		return error("A valid reservationId is required");
	}

	const reservation = await getReservationById(reservationId);
	if (!reservation?.idPhotoBlobKey) return error("Not found", 404);

	const blob = await getIdPhotoBlob(reservation.idPhotoBlobKey);
	if (!blob) return error("Not found", 404);

	return new Response(blob.data, {
		headers: {
			"content-type": blob.contentType,
			"cache-control": "private, no-store",
		},
	});
};
