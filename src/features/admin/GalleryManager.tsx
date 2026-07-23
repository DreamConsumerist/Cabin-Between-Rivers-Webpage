import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { FunctionComponent } from "../../common/types";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/forms/TextField";
import {
	useDeleteGalleryPhoto,
	useGalleryPhotos,
	useReorderGalleryPhotos,
	useUpdateGalleryPhotoCaption,
	useUploadGalleryPhoto,
} from "../gallery/hooks";
import type { GalleryPhoto } from "../gallery/api";

const UploadForm = (): FunctionComponent => {
	const upload = useUploadGalleryPhoto();
	const [file, setFile] = useState<File | null>(null);
	const [alt, setAlt] = useState("");
	const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

	// Revokes each preview URL once it's superseded (by a new file) or the
	// component unmounts; the URL itself is derived above, not effect state.
	useEffect(() => {
		return (): void => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const handleSubmit = (event: FormEvent): void => {
		event.preventDefault();
		if (!file) return;
		upload.mutate(
			{ file, alt: alt.trim() },
			{
				onSuccess: () => {
					setFile(null);
					setAlt("");
				},
			}
		);
	};

	return (
		<form className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 p-4" onSubmit={handleSubmit}>
			{previewUrl && (
				<img alt="Selected preview" className="h-16 w-16 rounded-lg object-cover" src={previewUrl} />
			)}
			<label className="flex flex-col gap-1 text-left">
				<span className="text-sm font-medium text-neutral-700">Photo</span>
				<input
					accept="image/jpeg,image/png,image/webp,image/gif"
					className="text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
					type="file"
					onChange={(event) => { setFile(event.target.files?.[0] ?? null); }}
				/>
			</label>
			<TextField
				label="Caption (optional)"
				value={alt}
				onChange={(event) => { setAlt(event.target.value); }}
			/>
			<Button disabled={!file || upload.isPending} type="submit">
				{upload.isPending ? "Uploading…" : "Add photo"}
			</Button>
			{upload.isError && <p className="w-full text-sm text-red-600">{upload.error.message}</p>}
		</form>
	);
};

type PhotoRowProps = {
	photo: GalleryPhoto;
	isFirst: boolean;
	isLast: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
};

const PhotoRow = ({ photo, isFirst, isLast, onMoveUp, onMoveDown }: PhotoRowProps): FunctionComponent => {
	const updateCaption = useUpdateGalleryPhotoCaption();
	const deletePhoto = useDeleteGalleryPhoto();
	const [alt, setAlt] = useState(photo.alt ?? "");

	return (
		<li className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
			<img alt={photo.alt ?? "Gallery photo"} className="h-16 w-16 shrink-0 rounded-lg object-cover" src={photo.src} />
			<input
				className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
				placeholder="Caption (optional)"
				value={alt}
				onChange={(event) => { setAlt(event.target.value); }}
			/>
			<div className="flex shrink-0 items-center gap-1">
				<button
					className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
					disabled={isFirst}
					type="button"
					onClick={onMoveUp}
				>
					↑
				</button>
				<button
					className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
					disabled={isLast}
					type="button"
					onClick={onMoveDown}
				>
					↓
				</button>
				<Button
					className="px-3 py-1.5 text-sm"
					disabled={alt.trim() === (photo.alt ?? "") || updateCaption.isPending}
					type="button"
					variant="secondary"
					onClick={() => { updateCaption.mutate({ id: photo.id, alt: alt.trim() }); }}
				>
					Save
				</Button>
				<Button
					className="px-3 py-1.5 text-sm"
					disabled={deletePhoto.isPending}
					type="button"
					variant="secondary"
					onClick={() => {
						if (confirm("Remove this photo from the gallery?")) deletePhoto.mutate(photo.id);
					}}
				>
					Delete
				</Button>
			</div>
		</li>
	);
};

export const GalleryManager = (): FunctionComponent => {
	const { data, isPending, error } = useGalleryPhotos();
	const reorder = useReorderGalleryPhotos();
	const photos = data?.photos ?? [];

	const move = (index: number, direction: -1 | 1): void => {
		const target = index + direction;
		if (target < 0 || target >= photos.length) return;
		const order = photos.map((photo) => photo.id);
		[order[index], order[target]] = [order[target]!, order[index]!];
		reorder.mutate(order);
	};

	return (
		<div className="flex flex-col gap-6">
			<UploadForm />

			{isPending && <p className="text-neutral-500">Loading photos…</p>}
			{error && <p className="text-sm text-red-600">{error.message}</p>}

			<ul className="flex flex-col gap-3">
				{photos.map((photo, index) => (
					<PhotoRow
						key={photo.id}
						isFirst={index === 0}
						isLast={index === photos.length - 1}
						photo={photo}
						onMoveDown={() => { move(index, 1); }}
						onMoveUp={() => { move(index, -1); }}
					/>
				))}
			</ul>
		</div>
	);
};
