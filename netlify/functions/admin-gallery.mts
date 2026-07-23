import { randomUUID } from "node:crypto";
import type { Context } from "@netlify/functions";
import { imageSize } from "image-size";
import { z } from "zod";
import { error, json } from "../../lib/http";
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
const MAX_BYTES = 10 * 1024 * 1024;

const reorderSchema = z.object({ order: z.array(z.number().int().positive()).min(1) });
const updateSchema = z.object({
	id: z.number().int().positive(),
	alt: z.string().trim().min(1).max(255),
});

// POST /api/admin-gallery — upload a photo (multipart/form-data: `file`, `alt`).
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
	if (typeof alt !== "string" || alt.trim().length === 0) return error("A caption is required");
	if (!ALLOWED_TYPES.has(file.type)) return error("Unsupported image type");
	if (file.size > MAX_BYTES) return error("Image is too large (max 10MB)");

	const data = await file.arrayBuffer();

	let width: number;
	let height: number;
	try {
		const size = imageSize(new Uint8Array(data));
		width = size.width;
		height = size.height;
	} catch {
		return error("Could not read image dimensions");
	}

	const blobKey = randomUUID();
	await putPhotoBlob(blobKey, data, file.type);
	const photo = await insertGalleryPhoto({ blobKey, alt: alt.trim(), width, height });
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
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return error("Invalid JSON body");
	}

	const parsed = updateSchema.safeParse(body);
	if (!parsed.success) return json({ error: "Invalid update", issues: parsed.error.issues }, 400);

	const photo = await updateGalleryPhotoAlt(parsed.data.id, parsed.data.alt);
	if (!photo) return error("Photo not found", 404);
	return json({ photo });
};

// PUT /api/admin-gallery — reorder photos: { order: [id, id, ...] } front-to-back
const handleReorder = async (req: Request): Promise<Response> => {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return error("Invalid JSON body");
	}

	const parsed = reorderSchema.safeParse(body);
	if (!parsed.success) return json({ error: "Invalid order", issues: parsed.error.issues }, 400);

	await reorderGalleryPhotos(parsed.data.order);
	return json({ ok: true });
};

export default async (req: Request, _context: Context): Promise<Response> => {
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
};
