import { createFileRoute } from "@tanstack/react-router";
import { fetchGalleryPhotos, preloadGalleryImages } from "../features/gallery/api";
import { GALLERY_QUERY_KEY, GALLERY_STALE_TIME_MS } from "../features/gallery/hooks";
import { About } from "../pages/About";

export const Route = createFileRoute("/about")({
	component: About,
	// Fires on navigation, and earlier on link-hover/focus thanks to the
	// router's `defaultPreload: "intent"` — fetches the photo list into the
	// same query cache `useGalleryPhotos` reads from, then preloads the images
	// themselves so they're already cached by the time the gallery renders.
	// Swallows fetch failures: `useGalleryPhotos` already renders its own error
	// state, so a bad preload (especially one firing early, on hover) must not
	// turn into a router-level navigation error.
	loader: async ({ context }) => {
		try {
			const { photos } = await context.queryClient.ensureQueryData({
				queryKey: GALLERY_QUERY_KEY,
				queryFn: fetchGalleryPhotos,
				staleTime: GALLERY_STALE_TIME_MS,
			});
			preloadGalleryImages(photos);
		} catch {
			// Ignored — see comment above.
		}
	},
});
