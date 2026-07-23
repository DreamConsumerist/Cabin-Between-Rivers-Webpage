import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	deleteGalleryPhoto,
	fetchGalleryPhotos,
	reorderGalleryPhotos,
	updateGalleryPhotoCaption,
	uploadGalleryPhoto,
	type GalleryPhoto,
} from "./api";

// Shared with the About route's loader (via `queryClient.ensureQueryData`) so
// a preload on link-hover and the `useGalleryPhotos` read below hit the same
// cache entry instead of firing two separate fetches.
export const GALLERY_QUERY_KEY = ["gallery"];

// Photos only change via an admin action (upload/reorder/delete), which
// already invalidates this query key directly — so treating a fetch as fresh
// for a few minutes doesn't risk showing stale data, and stops every
// link-hover preload (router `defaultPreload: "intent"`, defaultPreloadStaleTime: 0)
// from refetching the whole list.
export const GALLERY_STALE_TIME_MS = 5 * 60_000;

export const useGalleryPhotos = (): UseQueryResult<{ photos: Array<GalleryPhoto> }, Error> =>
	useQuery({
		queryKey: GALLERY_QUERY_KEY,
		queryFn: fetchGalleryPhotos,
		staleTime: GALLERY_STALE_TIME_MS,
	});

// The admin gallery manager mutations all invalidate the same query so the
// list (used by both the manager and the public About page) stays in sync.
export const useUploadGalleryPhoto = (): UseMutationResult<
	{ photo: GalleryPhoto },
	Error,
	{ file: File; alt: string }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ file, alt }) => uploadGalleryPhoto(file, alt),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: GALLERY_QUERY_KEY }),
	});
};

export const useDeleteGalleryPhoto = (): UseMutationResult<{ deleted: boolean }, Error, number> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteGalleryPhoto(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: GALLERY_QUERY_KEY }),
	});
};

export const useUpdateGalleryPhotoCaption = (): UseMutationResult<
	{ photo: GalleryPhoto },
	Error,
	{ id: number; alt: string }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, alt }) => updateGalleryPhotoCaption(id, alt),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: GALLERY_QUERY_KEY }),
	});
};

export const useReorderGalleryPhotos = (): UseMutationResult<{ ok: boolean }, Error, Array<number>> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (order: Array<number>) => reorderGalleryPhotos(order),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: GALLERY_QUERY_KEY }),
	});
};
