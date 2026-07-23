import { Outlet } from "@tanstack/react-router";
import type { FunctionComponent } from "../../common/types";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

// Shared shell for every route: nav header, page content, footer pinned to the
// bottom even on short pages (flex-1 fills remaining space between Nav/Footer).
export const RootLayout = (): FunctionComponent => {
	return (
		<div className="flex min-h-screen flex-col">
			<Nav />
			<div className="flex-1">
				<Outlet />
			</div>
			<Footer />
		</div>
	);
};
