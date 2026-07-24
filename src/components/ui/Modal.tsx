import { useEffect, useRef, type ReactNode } from "react";
import type { FunctionComponent } from "../../common/types";

const CloseIcon = (): FunctionComponent => (
	<svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
		<path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

type ModalProps = {
	title: string;
	onClose: () => void;
	children: ReactNode;
};

// Generic centered dialog: overlay + panel, Escape-to-close, focus-on-open,
// and a body scroll lock — same behaviors as the Gallery lightbox
// (src/components/ui/Gallery.tsx), generalized for arbitrary content.
export const Modal = ({ title, onClose, children }: ModalProps): FunctionComponent => {
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeButtonRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return (): void => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	useEffect(() => {
		const { overflow } = document.body.style;
		document.body.style.overflow = "hidden";
		return (): void => {
			document.body.style.overflow = overflow;
		};
	}, []);

	return (
		<div
			aria-label={title}
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			role="dialog"
			onClick={onClose}
		>
			<div
				className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
				onClick={(event) => { event.stopPropagation(); }}
			>
				<div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
					<h2 className="text-lg font-semibold">{title}</h2>
					<button
						ref={closeButtonRef}
						aria-label="Close"
						className="rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
						type="button"
						onClick={onClose}
					>
						<CloseIcon />
					</button>
				</div>
				<div className="overflow-y-auto px-6 py-4">{children}</div>
			</div>
		</div>
	);
};
