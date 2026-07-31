import { Link } from "@tanstack/react-router";
import type { FunctionComponent } from "../../common/types";
import logo from "../../assets/logo-bw.jpg";

const navLinkClass =
	"text-sm font-medium text-neutral-600 transition-colors hover:text-brand-700 data-[status=active]:text-brand-700";

export const Nav = (): FunctionComponent => {
	return (
		<header className="relative z-10 bg-white shadow-md">
			<nav className="flex items-center justify-between px-8 py-4">
				<Link
					className="flex items-center gap-3 text-lg font-semibold tracking-tight"
					to="/"
				>
					<img
						alt=""
						className="h-10 w-10 rounded-full object-cover"
						src={logo}
					/>
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
						className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-brand-700"
						to="/booking"
					>
						Book now
					</Link>
				</div>
			</nav>
		</header>
	);
};
