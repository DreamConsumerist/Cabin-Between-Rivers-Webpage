import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@sentry/react";
import { RouterProvider } from "@tanstack/react-router";
import type { FunctionComponent } from "./common/types";
import type { TanstackRouter } from "./main";
import { queryClient } from "./queryClient";

type AppProps = { router: TanstackRouter };

// Catches a render-time exception that would otherwise blank the whole page,
// reports it to Sentry (see src/sentry.ts), and shows a minimal fallback —
// deliberately plain, matching this app's other error-state copy (see
// SETUP.md's "Known issues" on deferred error-state polish).
const errorFallback = (
	<div className="flex min-h-screen items-center justify-center p-8 text-center">
		<div>
			<p className="text-lg font-semibold text-neutral-700">Something went wrong.</p>
			<p className="mt-2 text-sm text-neutral-500">
				Please refresh the page. If this keeps happening, contact us directly.
			</p>
		</div>
	</div>
);

const App = ({ router }: AppProps): FunctionComponent => {
	return (
		<QueryClientProvider client={queryClient}>
			<ErrorBoundary fallback={errorFallback}>
				<RouterProvider router={router} />
			</ErrorBoundary>
		</QueryClientProvider>
	);
};

export default App;
