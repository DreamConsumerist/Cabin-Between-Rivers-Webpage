// Small helpers for JSON responses from Netlify Functions.

import type { Context } from "@netlify/functions";
import { reportError } from "./sentry";

export const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});

export const error = (message: string, status = 400): Response =>
	json({ error: message }, status);

// Wraps a function handler so an unhandled exception reports to Sentry, logs
// server-side, and returns a generic message — instead of falling through to
// Netlify's raw Lambda error page, which leaks internal file paths to
// whoever hit the endpoint (see SETUP.md's former "Functions leak raw stack
// traces" known issue; this is that fix). `name` tags the Sentry event per
// endpoint so events group/filter by function instead of one bucket for
// every 500. Doesn't interfere with a handler's own try/catch returning a
// specific Response (e.g. a 409 on a booking conflict) — only catches what
// escapes past that.
//
// The response includes the Sentry event id as a reference — otherwise every
// unrelated 500 reads as the same unhelpful "Something went wrong" with
// nothing to relay when reporting it. Logging the same id server-side (not
// just inside the Sentry payload) means it's greppable in the Netlify
// function log even without SENTRY_DSN configured.
export const withErrorHandling =
	(name: string, handler: (req: Request, context: Context) => Promise<Response>) =>
	async (req: Request, context: Context): Promise<Response> => {
		try {
			return await handler(req, context);
		} catch (e) {
			const ref = await reportError(e, name);
			console.error(`${name}: unhandled error [ref ${ref}]`, e);
			return error(`Something went wrong. Reference: ${ref}`, 500);
		}
	};

// Same contract as withErrorHandling above, for the scheduled (cron)
// function (ical-sync.mts), whose signature has no Request/Response — a
// thrown error there has no caller to see it, so without this it's invisible
// outside the Netlify function log.
export const withScheduledErrorHandling =
	(name: string, handler: () => Promise<void>) =>
	async (): Promise<void> => {
		try {
			await handler();
		} catch (e) {
			const ref = await reportError(e, name);
			console.error(`${name}: unhandled error [ref ${ref}]`, e);
		}
	};

// Guard a function to a single HTTP method; returns a 405 Response if it doesn't match.
export const requireMethod = (req: Request, method: string): Response | null =>
	req.method === method ? null : error(`Method not allowed`, 405);

// Parses a JSON request body, returning a ready-to-return 400 Response instead
// of throwing when the body isn't valid JSON.
export type ParsedJsonBody = { ok: true; body: unknown } | { ok: false; response: Response };

export const parseJsonBody = async (req: Request): Promise<ParsedJsonBody> => {
	try {
		return { ok: true, body: await req.json() };
	} catch {
		return { ok: false, response: error("Invalid JSON body") };
	}
};
