import { createRouter } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { queryClient } from "./queryClient";
import { routeTree } from "./routeTree.gen.ts";
import "./styles/tailwind.css";

const router = createRouter({
	routeTree,
	context: { queryClient },
	// Prefetch a route's loader (and the data/images it kicks off) as soon as
	// the user hovers/focuses a Link to it, so it's already cached by the time
	// they click — see the About route's loader for the gallery preload.
	defaultPreload: "intent",
	// Let react-query's own staleTime govern re-fetching instead of the
	// router's separate preload cache.
	defaultPreloadStaleTime: 0,
});

export type TanstackRouter = typeof router;

declare module "@tanstack/react-router" {
	interface Register {
		// This infers the type of our router and registers it across your entire project
		router: TanstackRouter;
	}
}

const rootElement = document.querySelector("#root") as Element;
if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<React.StrictMode>
			<React.Suspense fallback="loading">
				<App router={router} />
			</React.Suspense>
		</React.StrictMode>
	);
}
