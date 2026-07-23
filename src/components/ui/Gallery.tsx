import { useCallback, useEffect, useRef, useState } from "react";
import type { FunctionComponent } from "../../common/types";

// width/height are the photo's natural pixel dimensions, known at upload time —
// used to pick a mosaic span that matches its orientation (see spanClassName).
export type GalleryPhoto = { id: string | number; src: string; alt: string | null; width: number; height: number };

const FALLBACK_ALT = "Gallery photo";

type GalleryProps = { photos: Array<GalleryPhoto> };

const CloseIcon = (): FunctionComponent => (
	<svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
		<path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const ChevronIcon = ({ direction }: { direction: "left" | "right" }): FunctionComponent => (
	<svg aria-hidden="true" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
		<path
			d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

type LightboxProps = {
	photos: Array<GalleryPhoto>;
	index: number;
	onClose: () => void;
	onPrev: () => void;
	onNext: () => void;
};

const Lightbox = ({ photos, index, onClose, onPrev, onNext }: LightboxProps): FunctionComponent => {
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const photo = photos[index];

	useEffect(() => {
		closeButtonRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onClose();
			if (event.key === "ArrowLeft") onPrev();
			if (event.key === "ArrowRight") onNext();
		};

		window.addEventListener("keydown", handleKeyDown);
		return (): void => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose, onPrev, onNext]);

	useEffect(() => {
		const { overflow } = document.body.style;
		document.body.style.overflow = "hidden";
		return (): void => {
			document.body.style.overflow = overflow;
		};
	}, []);

	if (!photo) {
		return null;
	}

	return (
		<div
			aria-label={photo.alt ?? FALLBACK_ALT}
			aria-modal="true"
			className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
			role="dialog"
			onClick={onClose}
		>
			<button
				ref={closeButtonRef}
				aria-label="Close gallery"
				className="self-end rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
				type="button"
				onClick={onClose}
			>
				<CloseIcon />
			</button>

			<div className="flex flex-1 items-center justify-center gap-2 overflow-hidden sm:gap-6">
				<button
					aria-label="Previous photo"
					className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onPrev();
					}}
				>
					<ChevronIcon direction="left" />
				</button>

				<img
					key={photo.id}
					alt={photo.alt ?? FALLBACK_ALT}
					className="max-h-full max-w-full rounded-lg object-contain"
					src={photo.src}
					onClick={(event) => {
						event.stopPropagation();
					}}
				/>

				<button
					aria-label="Next photo"
					className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onNext();
					}}
				>
					<ChevronIcon direction="right" />
				</button>
			</div>

			<p className="pt-4 text-center text-sm text-white/80">
				{photo.alt && `${photo.alt} · `}
				<span className="text-white/50">
					{index + 1} / {photos.length}
				</span>
			</p>
		</div>
	);
};

// Derives a mosaic span from the photo's own aspect ratio (not its position in
// the list), so the layout stays sensible as photos are added, removed, or
// reordered. A tall portrait shot spans 2 rows; a wide landscape shot spans 2
// columns; anything closer to square gets no span.
const spanClassName = (photo: GalleryPhoto): string => {
	const ratio = photo.width / photo.height;
	if (ratio < 0.85) return "sm:row-span-2";
	if (ratio > 1.3) return "sm:col-span-2";
	return "";
};

export const Gallery = ({ photos }: GalleryProps): FunctionComponent => {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const close = useCallback(() => {
		setOpenIndex((current) => {
			if (current !== null) {
				triggerRefs.current[current]?.focus();
			}
			return null;
		});
	}, []);

	const showPrevious = useCallback(() => {
		setOpenIndex((current) => (current === null ? null : (current - 1 + photos.length) % photos.length));
	}, [photos.length]);

	const showNext = useCallback(() => {
		setOpenIndex((current) => (current === null ? null : (current + 1) % photos.length));
	}, [photos.length]);

	return (
		<>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:auto-rows-[10rem]">
				{photos.map((photo, index) => (
					<button
						key={photo.id}
						ref={(element) => {
							triggerRefs.current[index] = element;
						}}
						aria-label={photo.alt ? `View photo: ${photo.alt}` : "View photo"}
						className={`group relative aspect-square overflow-hidden rounded-xl sm:aspect-auto ${spanClassName(photo)}`}
						type="button"
						onClick={() => {
							setOpenIndex(index);
						}}
					>
						<img
							alt={photo.alt ?? FALLBACK_ALT}
							className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							src={photo.src}
						/>
					</button>
				))}
			</div>

			{openIndex !== null && (
				<Lightbox index={openIndex} photos={photos} onClose={close} onNext={showNext} onPrev={showPrevious} />
			)}
		</>
	);
};
