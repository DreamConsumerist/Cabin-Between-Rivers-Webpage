import * as Sentry from "@sentry/react";

// Strips the query string — guest-facing links carry an unguessable token
// there instead of a login (booking/cancel's ?token=), so it must never
// reach Sentry.
const scrubUrl = (url: string): string => {
	try {
		const parsed = new URL(url);
		parsed.search = "";
		return parsed.toString();
	} catch {
		return url;
	}
};

// Called once from main.tsx before the app renders. No-ops silently if the
// DSN isn't configured — same contract as lib/sentry.ts server-side: a
// missing/misconfigured Sentry setup must never be why the site fails to
// boot for a guest.
export const initSentry = (): void => {
	const dsn = import.meta.env.VITE_SENTRY_DSN;
	if (!dsn) return;

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		// Explicit even though it's already the default — guest PII (names,
		// emails, phone, photo IDs) flows through this app's forms.
		sendDefaultPii: false,
		beforeSend(event) {
			if (event.request?.url) event.request.url = scrubUrl(event.request.url);
			return event;
		},
		beforeBreadcrumb(breadcrumb) {
			const data = breadcrumb.data;
			if (typeof data?.["url"] === "string") data["url"] = scrubUrl(data["url"]);
			if (typeof data?.["to"] === "string") data["to"] = scrubUrl(data["to"]);
			return breadcrumb;
		},
	});
};
