import type { Context } from "@netlify/functions";
import { error, json, requireMethod } from "../../lib/http";
import { listGalleryPhotos } from "../../lib/gallery";

// GET /api/gallery -> the About page's photo list, in display order. Public —
// no admin session required.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	try {
		const photos = await listGalleryPhotos();
		return json({
			photos: photos.map((photo) => ({
				id: photo.id,
				alt: photo.alt,
				width: photo.width,
				height: photo.height,
				src: `/api/gallery-image?key=${encodeURIComponent(photo.blobKey)}`,
			})),
		});
	} catch (e) {
		console.error("gallery failed", e);
		return error("Failed to load gallery", 500);
	}
};
