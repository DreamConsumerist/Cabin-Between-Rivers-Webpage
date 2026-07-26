import { error, requireMethod, withErrorHandling } from "../../lib/http";
import { getPhotoBlob } from "../../lib/blobs";

// GET /api/gallery-image?key=<blobKey> -> streams the photo's raw bytes.
// Public — no admin session required. Blob keys are single-use (a re-upload
// gets a fresh key rather than overwriting one), so the response is safe to
// cache as immutable.
export default withErrorHandling("gallery-image", async (req, _context) => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	const key = new URL(req.url).searchParams.get("key");
	if (!key) return error("key is required");

	const blob = await getPhotoBlob(key);
	if (!blob) return error("Not found", 404);

	return new Response(blob.data, {
		headers: {
			"content-type": blob.contentType,
			"cache-control": "public, max-age=31536000, immutable",
		},
	});
});
