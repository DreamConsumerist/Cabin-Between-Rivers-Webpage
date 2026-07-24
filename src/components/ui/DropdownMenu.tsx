import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FunctionComponent } from "../../common/types";

type DropdownMenuProps = { label: string; children: ReactNode };

// Lightweight "⋮" overflow menu — a trigger button plus an absolutely
// positioned panel, closing on outside click or Escape. Deliberately lighter
// than Modal.tsx (no focus trap / body-scroll-lock): this is a small inline
// menu, not a full dialog. Menu items are plain buttons passed as children;
// clicking any of them closes the menu via the panel's own click handler.
export const DropdownMenu = ({ label, children }: DropdownMenuProps): FunctionComponent => {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;

		const onClickOutside = (event: MouseEvent): void => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") setOpen(false);
		};

		document.addEventListener("mousedown", onClickOutside);
		document.addEventListener("keydown", onKeyDown);
		return (): void => {
			document.removeEventListener("mousedown", onClickOutside);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={containerRef} className="relative">
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label={label}
				className="rounded-lg px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-neutral-100"
				type="button"
				onClick={() => {
					setOpen((value) => !value);
				}}
			>
				⋮
			</button>
			{open && (
				<div
					className="absolute right-0 z-10 mt-1 min-w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
					role="menu"
					onClick={() => {
						setOpen(false);
					}}
				>
					{children}
				</div>
			)}
		</div>
	);
};
