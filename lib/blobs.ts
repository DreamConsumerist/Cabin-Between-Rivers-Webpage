import { getStore } from "@netlify/blobs";

// Gallery image bytes live here, keyed by db/schema.ts's galleryPhotos.blobKey.
// Display metadata (alt, dimensions, order) lives in Postgres — this store only
// ever holds raw image bytes.
const store = () => getStore("gallery-photos");

export const putPhotoBlob = async (key: string, data: ArrayBuffer, contentType: string): Promise<void> => {
	await store().set(key, data, { metadata: { contentType } });
};

export const getPhotoBlob = async (
	key: string
): Promise<{ data: ArrayBuffer; contentType: string } | null> => {
	const result = await store().getWithMetadata(key, { type: "arrayBuffer" });
	if (!result) return null;
	const contentType =
		typeof result.metadata.contentType === "string" ? result.metadata.contentType : "application/octet-stream";
	return { data: result.data, contentType };
};

export const deletePhotoBlob = (key: string): Promise<void> => store().delete(key);

// Guest-uploaded photo IDs — a SEPARATE store from gallery-photos because this
// is sensitive PII, never served publicly (contrast lib/gallery.ts's photos,
// which are meant to be public). Only netlify/functions/admin-id-photo.mts
// (admin-gated) ever reads from this store.
const idPhotoStore = () => getStore("id-photos");

export const putIdPhotoBlob = async (key: string, data: ArrayBuffer, contentType: string): Promise<void> => {
	await idPhotoStore().set(key, data, { metadata: { contentType } });
};

export const getIdPhotoBlob = async (
	key: string
): Promise<{ data: ArrayBuffer; contentType: string } | null> => {
	const result = await idPhotoStore().getWithMetadata(key, { type: "arrayBuffer" });
	if (!result) return null;
	const contentType =
		typeof result.metadata.contentType === "string" ? result.metadata.contentType : "application/octet-stream";
	return { data: result.data, contentType };
};

export const deleteIdPhotoBlob = (key: string): Promise<void> => idPhotoStore().delete(key);
