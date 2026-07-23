import { QueryClient } from "@tanstack/react-query";

// Shared singleton so route loaders (via router context) and components (via
// QueryClientProvider) read/write the same cache — a loader's
// `ensureQueryData` call is only useful for preloading if components later
// hit the same cache instead of refetching.
export const queryClient = new QueryClient();
