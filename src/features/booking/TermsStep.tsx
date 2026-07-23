import { useCallback, useRef, useState } from "react";
import type { FunctionComponent } from "../../common/types";

type TermsStepProps = {
	accepted: boolean;
	onAcceptedChange: (accepted: boolean) => void;
};

// How close to the bottom (in px) counts as "reached the end" — avoids
// requiring pixel-perfect scrolling to satisfy the check.
const SCROLL_THRESHOLD_PX = 24;

// The terms document is same-origin (served from public/terms.html), so we can
// read its scroll position directly instead of needing a postMessage bridge.
export const TermsStep = ({ accepted, onAcceptedChange }: TermsStepProps): FunctionComponent => {
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

	return (
		<div className="flex w-full max-w-lg flex-col items-center gap-4">
			<p className="text-neutral-700">Please review and accept the terms before paying.</p>
			<iframe
				ref={iframeRef}
				className="h-80 w-full rounded-lg border border-neutral-200"
				src="/terms.html"
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
		</div>
	);
};
