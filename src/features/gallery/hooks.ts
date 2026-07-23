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

const GALLERY_QUERY_KEY = ["gallery"];

export const useGalleryPhotos = (): UseQueryResult<{ photos: Array<GalleryPhoto> }, Error> =>
	useQuery({ queryKey: GALLERY_QUERY_KEY, queryFn: fetchGalleryPhotos });

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
