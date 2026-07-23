import { jsonFetch } from "../../common/utilities";

export type GalleryPhoto = {
	id: number;
	alt: string | null;
	width: number;
	height: number;
	src: string;
};

// Public — the About page's photo list, in display order.
export const fetchGalleryPhotos = (): Promise<{ photos: Array<GalleryPhoto> }> =>
	jsonFetch("/api/gallery");

// Kicks off a browser fetch for each photo so they're already in the HTTP
// cache by the time the gallery actually renders them (see the About route's
// loader, which calls this on link-hover/navigation).
export const preloadGalleryImages = (photos: Array<GalleryPhoto>): void => {
	for (const photo of photos) {
		const image = new Image();
		image.src = photo.src;
	}
};

// Everything below requires an admin session (see src/features/admin).

export const uploadGalleryPhoto = (file: File, alt: string): Promise<{ photo: GalleryPhoto }> => {
	const form = new FormData();
	form.set("file", file);
	form.set("alt", alt);
	return jsonFetch("/api/admin-gallery", { method: "POST", body: form });
};

export const deleteGalleryPhoto = (id: number): Promise<{ deleted: boolean }> =>
	jsonFetch(`/api/admin-gallery?id=${id}`, { method: "DELETE" });

export const updateGalleryPhotoCaption = (id: number, alt: string): Promise<{ photo: GalleryPhoto }> =>
	jsonFetch("/api/admin-gallery", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ id, alt }),
	});

export const reorderGalleryPhotos = (order: Array<number>): Promise<{ ok: boolean }> =>
	jsonFetch("/api/admin-gallery", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ order }),
	});
