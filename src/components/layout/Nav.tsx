import { Link } from "@tanstack/react-router";
import type { FunctionComponent } from "../../common/types";

const navLinkClass =
	"text-sm font-medium text-neutral-600 transition-colors hover:text-brand-700 data-[status=active]:text-brand-700";

export const Nav = (): FunctionComponent => {
	return (
		<header className="border-b border-neutral-200">
			<nav className="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
				<Link className="text-lg font-semibold tracking-tight" to="/">
					Cabin Between Rivers
				</Link>
				<div className="flex items-center gap-6">
					<Link className={navLinkClass} to="/">
						Home
					</Link>
					<Link className={navLinkClass} to="/about">
						About
					</Link>
					<Link
						className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
						to="/booking"
					>
						Book now
					</Link>
				</div>
			</nav>
		</header>
	);
};
