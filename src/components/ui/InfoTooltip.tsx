import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FunctionComponent } from "../../common/types";

type InfoTooltipProps = { label: string; children: ReactNode };

// Small "i" icon that reveals a text panel on hover/focus (pointer & keyboard
// users) or on tap (touch devices, which have neither hover nor focus-within
// in a useful sense) — closes on outside click/Escape like DropdownMenu.tsx,
// so a tap elsewhere doesn't leave it stuck open on mobile.
export const InfoTooltip = ({ label, children }: InfoTooltipProps): FunctionComponent => {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLSpanElement>(null);

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
		<span ref={containerRef} className="group relative inline-flex">
			<button
				aria-label={label}
				className="flex h-4 w-4 items-center justify-center rounded-full border border-neutral-300 text-[10px] font-semibold leading-none text-neutral-500 hover:border-brand-400 hover:text-brand-600"
				type="button"
				onClick={() => {
					setOpen((value) => !value);
				}}
			>
				i
			</button>
			<span
				role="tooltip"
				className={`absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2 text-xs font-normal normal-case text-neutral-600 shadow-lg transition-opacity ${
					open
						? "opacity-100"
						: "pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
				}`}
			>
				{children}
			</span>
		</span>
	);
};
