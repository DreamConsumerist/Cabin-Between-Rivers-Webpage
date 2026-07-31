import { randomUUID } from "node:crypto";
import { imageSize } from "image-size";
import { z } from "zod";
import { error, json, parseJsonBody, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import {
	deleteGalleryPhoto,
	getGalleryPhotoById,
	insertGalleryPhoto,
	reorderGalleryPhotos,
	updateGalleryPhotoAlt,
} from "../../lib/gallery";
import { deletePhotoBlob, putPhotoBlob } from "../../lib/blobs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Netlify Functions reject anything over ~6MB at the platform level before
// this code ever runs (a bare 413 with no JSON body — see
// src/common/imageUpload.ts's comment). The frontend already resizes a
// photo client-side before it uploads, so in practice this should rarely
// bind — it exists as a backstop for direct API calls (or a resize that
// silently no-oped) so those get this endpoint's own clear JSON error
// instead of the platform's opaque one. Kept below the platform ceiling,
// with headroom for multipart/form-data's own framing overhead.
const MAX_BYTES = 5 * 1024 * 1024;

// Displayed at most a few hundred px tall in the mosaic grid, or within the
// viewport in the lightbox (see src/components/ui/Gallery.tsx) — nothing on
// this site ever needs a longer edge than this, so anything bigger than a
// phone photo gets downscaled before it's stored. `fit: "inside"` scales by
// the more constraining dimension and preserves aspect ratio;
// `withoutEnlargement` leaves already-small uploads alone.
const MAX_DIMENSION = 2000;

const reorderSchema = z.object({ order: z.array(z.number().int().positive()).min(1) });
const updateSchema = z.object({
	id: z.number().int().positive(),
	alt: z.string().trim().max(255),
});

// POST /api/admin-gallery — upload a photo (multipart/form-data: `file`, optional `alt`).
const handleUpload = async (req: Request): Promise<Response> => {
	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return error("Expected multipart/form-data");
	}

	const file = form.get("file");
	const alt = form.get("alt");
	if (!(file instanceof File)) return error("A file is required");
	if (!ALLOWED_TYPES.has(file.type)) return error("Unsupported image type");
	if (file.size > MAX_BYTES) return error("Image is too large (max 5MB)");

	const data = await file.arrayBuffer();
	const originalBuffer = Buffer.from(data);

	// Read dimensions with a pure-JS library (no native binary to fail to
	// load) rather than sharp — this is required for every upload (the DB
	// column is NOT NULL), so it needs to be the reliable path; sharp below
	// is only ever a size optimization on top.
	let width: number;
	let height: number;
	try {
		const size = imageSize(new Uint8Array(data));
		width = size.width;
		height = size.height;
	} catch {
		return error("Could not read image dimensions");
	}

	// Best-effort resize — the frontend already resizes client-side before
	// uploading (src/common/imageUpload.ts), so this mainly matters for a
	// GIF (deliberately left unresized client-side, to preserve animation)
	// or a direct API call that skipped that step. Deliberately non-fatal:
	// sharp ships a native binary per platform, and loading it can fail at
	// import time itself (not just when called) if that binary isn't
	// available in this environment — seen locally on Windows via Netlify
	// CLI's local function bundler mishandling pnpm's symlinked optional
	// dependency. A *static* top-level `import sharp from "sharp"` would
	// crash this whole function before any handler code (including a
	// try/catch around using it) ever ran; importing it dynamically here,
	// inside the try, is what makes a failure to load — not just a failure
	// to run — catchable, so this degrades to storing the original bytes
	// instead of failing the upload outright.
	let finalBuffer: Buffer = originalBuffer;
	if (Math.max(width, height) > MAX_DIMENSION) {
		try {
			const { default: sharp } = await import("sharp");
			// animated: true keeps every frame of an uploaded GIF in the resize
			// (sharp otherwise only reads the first) so it doesn't silently turn
			// into a still image.
			const pipeline = sharp(originalBuffer, { animated: file.type === "image/gif" }).resize({
				width: MAX_DIMENSION,
				height: MAX_DIMENSION,
				fit: "inside",
				withoutEnlargement: true,
			});
			const output = await pipeline.toBuffer({ resolveWithObject: true });
			finalBuffer = output.data;
			width = output.info.width;
			height = output.info.height;
		} catch (e) {
			console.error("admin-gallery: sharp resize failed, storing original", e);
		}
	}

	const trimmedAlt = typeof alt === "string" ? alt.trim() : "";
	const blobKey = randomUUID();
	// putPhotoBlob takes an ArrayBuffer; Buffer is a Uint8Array view, so slice
	// out exactly its bytes rather than the whole (possibly larger, pooled)
	// underlying buffer.
	const finalArrayBuffer = finalBuffer.buffer.slice(
		finalBuffer.byteOffset,
		finalBuffer.byteOffset + finalBuffer.byteLength
	) as ArrayBuffer;
	await putPhotoBlob(blobKey, finalArrayBuffer, file.type);
	const photo = await insertGalleryPhoto({
		blobKey,
		alt: trimmedAlt.length > 0 ? trimmedAlt : null,
		width,
		height,
	});
	return json({ photo }, 201);
};

// DELETE /api/admin-gallery?id=<id>
const handleDelete = async (req: Request): Promise<Response> => {
	const id = Number(new URL(req.url).searchParams.get("id"));
	if (!Number.isInteger(id) || id <= 0) return error("A valid id is required");

	const photo = await getGalleryPhotoById(id);
	if (!photo) return error("Photo not found", 404);

	await deleteGalleryPhoto(id);
	await deletePhotoBlob(photo.blobKey);
	return json({ deleted: true });
};

// PATCH /api/admin-gallery — update a photo's caption: { id, alt }
const handleUpdate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = updateSchema.safeParse(parsedBody.body);
	if (!parsed.success) return json({ error: "Invalid update", issues: parsed.error.issues }, 400);

	const alt = parsed.data.alt.length > 0 ? parsed.data.alt : null;
	const photo = await updateGalleryPhotoAlt(parsed.data.id, alt);
	if (!photo) return error("Photo not found", 404);
	return json({ photo });
};

// PUT /api/admin-gallery — reorder photos: { order: [id, id, ...] } front-to-back
const handleReorder = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = reorderSchema.safeParse(parsedBody.body);
	if (!parsed.success) return json({ error: "Invalid order", issues: parsed.error.issues }, 400);

	await reorderGalleryPhotos(parsed.data.order);
	return json({ ok: true });
};

export default withErrorHandling("admin-gallery", async (req, _context) => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	try {
		switch (req.method) {
			case "POST":
				return await handleUpload(req);
			case "DELETE":
				return await handleDelete(req);
			case "PATCH":
				return await handleUpdate(req);
			case "PUT":
				return await handleReorder(req);
			default:
				return error("Method not allowed", 405);
		}
	} catch (e) {
		console.error("admin-gallery failed", e);
		return error("Request failed", 500);
	}
});
