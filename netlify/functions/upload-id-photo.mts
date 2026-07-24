import { randomUUID } from "node:crypto";
import type { Context } from "@netlify/functions";
import { error, json, requireMethod } from "../../lib/http";
import { getReservationById, setReservationIdPhoto } from "../../lib/availability";
import { deleteIdPhotoBlob, putIdPhotoBlob } from "../../lib/blobs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

// POST /api/upload-id-photo — multipart/form-data: `reservationId`, `file`.
// Required before payment (see src/features/booking/TermsStep.tsx) for a
// still-pending reservation. Guest-facing, no admin session — reservationId
// is the only credential, so setReservationIdPhoto only ever touches a row
// that's still `pending` (not someone else's already-confirmed booking).
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return error("Expected multipart/form-data");
	}

	const reservationId = Number(form.get("reservationId"));
	if (!Number.isInteger(reservationId) || reservationId <= 0) {
		return error("A valid reservationId is required");
	}

	const file = form.get("file");
	if (!(file instanceof File)) return error("A file is required");
	if (!ALLOWED_TYPES.has(file.type)) return error("Unsupported image type");
	if (file.size > MAX_BYTES) return error("Image is too large (max 10MB)");

	const reservation = await getReservationById(reservationId);
	if (!reservation) return error("Reservation not found", 404);
	if (reservation.status !== "pending") {
		return error("This reservation can no longer accept an ID upload", 409);
	}

	const data = await file.arrayBuffer();
	const blobKey = randomUUID();

	try {
		await putIdPhotoBlob(blobKey, data, file.type);

		const updated = await setReservationIdPhoto(reservationId, blobKey);
		if (!updated) {
			// Lost a race with expire-holds/cancel between the status check above
			// and this update — don't leave an orphaned blob behind.
			await deleteIdPhotoBlob(blobKey);
			return error("This reservation can no longer accept an ID upload", 409);
		}

		// Replacing an earlier upload (guest re-selected a file) — clean up the
		// superseded blob so it doesn't linger.
		if (reservation.idPhotoBlobKey) {
			await deleteIdPhotoBlob(reservation.idPhotoBlobKey);
		}

		return json({ ok: true });
	} catch (e) {
		console.error("upload-id-photo failed", e);
		return error("Could not upload ID", 500);
	}
};
