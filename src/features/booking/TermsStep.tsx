import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FunctionComponent } from "../../common/types";
import { useUploadIdPhoto } from "./hooks";

type TermsStepProps = {
	accepted: boolean;
	onAcceptedChange: (accepted: boolean) => void;
	reservationId: number;
	idPhotoUploaded: boolean;
	onIdPhotoUploadedChange: (uploaded: boolean) => void;
};

// How close to the bottom (in px) counts as "reached the end" — avoids
// requiring pixel-perfect scrolling to satisfy the check.
const SCROLL_THRESHOLD_PX = 24;

export const TermsStep = ({
	accepted,
	onAcceptedChange,
	reservationId,
	idPhotoUploaded,
	onIdPhotoUploadedChange,
}: TermsStepProps): FunctionComponent => {
	const [scrolledToBottom, setScrolledToBottom] = useState(false);
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const handleIframeLoad = useCallback((): void => {
		const iframeWindow = iframeRef.current?.contentWindow;
		const iframeDocument = iframeRef.current?.contentDocument;
		if (!iframeWindow || !iframeDocument) return;

		const checkScrollPosition = (): void => {
			const scroller = iframeDocument.scrollingElement ?? iframeDocument.documentElement;
			const distanceFromBottom =
				scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
			if (distanceFromBottom <= SCROLL_THRESHOLD_PX) {
				setScrolledToBottom(true);
			}
		};

		checkScrollPosition(); // covers a document short enough to need no scrolling at all
		iframeWindow.addEventListener("scroll", checkScrollPosition);
	}, []);

	// Once accepted, keep the checkbox usable even if this step remounts and the
	// local scroll-tracking resets — we don't need to re-force a re-read.
	const checkboxDisabled = !scrolledToBottom && !accepted;

	const uploadIdPhoto = useUploadIdPhoto();
	const [file, setFile] = useState<File | null>(null);
	const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

	useEffect(() => {
		return (): void => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const handleFileChange = (selected: File | null): void => {
		setFile(selected);
		if (!selected) return;
		// A newly-picked file supersedes any prior successful upload — require
		// this one to finish before "Continue to payment" is allowed again.
		onIdPhotoUploadedChange(false);
		uploadIdPhoto.mutate(
			{ reservationId, file: selected },
			{ onSuccess: () => { onIdPhotoUploadedChange(true); } }
		);
	};

	return (
		<div className="flex w-full max-w-lg flex-col items-center gap-4">
			<p className="text-neutral-700">Please review and accept the terms before paying.</p>
			<iframe
				ref={iframeRef}
				className="h-[60vh] max-h-168 min-h-80 w-full rounded-lg border border-neutral-200"
				src="/api/terms"
				title="Terms and Conditions"
				onLoad={handleIframeLoad}
			/>
			{!scrolledToBottom && !accepted && (
				<p className="text-sm text-neutral-500">Scroll to the bottom to continue.</p>
			)}
			<label className="flex items-center gap-2 text-sm text-neutral-700">
				<input
					checked={accepted}
					disabled={checkboxDisabled}
					type="checkbox"
					onChange={(event_) => { onAcceptedChange(event_.target.checked); }}
				/>
				I have read and accept the Terms &amp; Conditions
			</label>

			<div className="flex w-full flex-col items-center gap-2 rounded-lg border border-neutral-200 p-4">
				<p className="text-sm font-medium text-neutral-700">
					Upload a photo ID <span className="text-red-600">(required)</span>
				</p>
				<p className="text-center text-xs text-neutral-500">
					We ask for this to verify the person checking in matches the reservation.
				</p>
				<div className="flex items-center gap-3">
					{previewUrl && (
						<img alt="ID preview" className="h-16 w-16 rounded-lg object-cover" src={previewUrl} />
					)}
					<label className="flex flex-col gap-1">
						<input
							accept="image/jpeg,image/png,image/webp"
							className="text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
							type="file"
							onChange={(event) => { handleFileChange(event.target.files?.[0] ?? null); }}
						/>
					</label>
				</div>
				{uploadIdPhoto.isPending && <p className="text-sm text-neutral-500">Uploading…</p>}
				{uploadIdPhoto.isError && (
					<p className="text-sm text-red-600">{uploadIdPhoto.error.message}</p>
				)}
				{idPhotoUploaded && !uploadIdPhoto.isPending && (
					<p className="text-sm text-green-700">ID uploaded.</p>
				)}
			</div>
		</div>
	);
};
