// Netlify Functions have a hard ~6MB request-body ceiling for synchronous
// invocations (an AWS API Gateway/Lambda constraint, not something our own
// function code controls) — well below what a modern phone camera produces
// straight out of the camera roll. A rejection there happens before our
// code ever runs, so it comes back as a bare platform 413 with no JSON body
// (see src/common/utilities.ts's jsonFetch — that's the "Request failed
// (413)" fallback message). Resizing client-side, before the upload ever
// hits the network, keeps real-world photos comfortably under that ceiling
// instead of bouncing off it.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

// Safely under the platform ceiling above, leaving headroom for
// multipart/form-data's own framing overhead. Used as a client-side
// pre-check so a file resizeImageForUpload couldn't shrink enough (chiefly
// an oversized animated GIF, which is deliberately left unresized below)
// fails fast with a clear message instead of a network round-trip ending in
// an opaque platform 413.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const stripExtension = (name: string): string => name.replace(/\.[^.]+$/, "");

// Downscales an image file to at most MAX_DIMENSION on its longest edge and
// re-encodes it as JPEG, for upload. Animated GIFs are left untouched —
// redrawing onto a canvas only ever captures a single frame, so resizing
// one would silently flatten its animation — the size check the caller
// does with MAX_UPLOAD_BYTES is what protects against an oversized GIF
// instead. Falls back to returning the original file untouched on any
// decode/encode failure, so a format quirk here never blocks an upload the
// server might otherwise have accepted.
export const resizeImageForUpload = async (file: File): Promise<File> => {
	if (file.type === "image/gif") return file;

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file;
	}

	try {
		const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
		const width = Math.round(bitmap.width * scale);
		const height = Math.round(bitmap.height * scale);

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) return file;
		context.drawImage(bitmap, 0, 0, width, height);

		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
		});
		if (!blob || blob.size >= file.size) return file;

		return new File([blob], `${stripExtension(file.name)}.jpg`, { type: "image/jpeg" });
	} finally {
		bitmap.close();
	}
};
