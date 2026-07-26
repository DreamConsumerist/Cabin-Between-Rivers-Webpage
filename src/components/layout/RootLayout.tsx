import { HeadContent, Outlet } from "@tanstack/react-router";
import type { FunctionComponent } from "../../common/types";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

// Shared shell for every route: nav header, page content, footer pinned to the
// bottom even on short pages (flex-1 fills remaining space between Nav/Footer).
export const RootLayout = (): FunctionComponent => {
	return (
		<div className="flex min-h-screen flex-col">
			{/* Renders each matched route's head() (title, meta, JSON-LD) as
			regular JSX — React 19 hoists <title>/<meta>/<link> tags rendered
			anywhere in the tree into the real document.head, so this works with
			no SSR setup. Only reaches crawlers/tools that execute JS (Google,
			Bing); see index.html's static tags for the non-JS fallback. */}
			<HeadContent />
			<Nav />
			<div className="flex-1">
				<Outlet />
			</div>
			<Footer />
		</div>
	);
};
