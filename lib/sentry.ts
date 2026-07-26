import { randomUUID } from "node:crypto";

// Minimal Sentry reporter — no SDK, matching lib/mailer.ts's plain-fetch
// style. @sentry/node's dependency tree (OpenTelemetry auto-instrumentation,
// import-in-the-middle) is large enough that Netlify's local dev bundler
// (which traces each of the ~30 functions' full file trees independently)
// reliably crashes on Windows with EMFILE — reproducible across multiple
// dev-server restarts, not a one-off. Speaking Sentry's HTTP envelope API
// directly avoids the entire tree. We only need captureException/
// captureMessage-equivalent behavior (no tracing/replay — see the "Error
// Monitoring only" decision), so hand-rolling this is a small, stable
// surface: https://develop.sentry.dev/sdk/data-model/envelopes/

type SentryLevel = "error" | "fatal";

type Dsn = { publicKey: string; envelopeUrl: string };

// DSN shape: https://{publicKey}@{host}/{projectId} — the envelope ingest
// endpoint is always {host}/api/{projectId}/envelope/.
const parseDsn = (dsn: string): Dsn | null => {
	try {
		const url = new URL(dsn);
		const projectId = url.pathname.replace(/^\//, "");
		if (!url.username || !projectId) return null;
		return {
			publicKey: url.username,
			envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
		};
	} catch {
		return null;
	}
};

// Lazily parsed once per warm invocation, not on every call.
let cachedDsn: Dsn | null | undefined;
const getDsn = (): Dsn | null => {
	if (cachedDsn !== undefined) return cachedDsn;
	const raw = process.env.SENTRY_DSN;
	cachedDsn = raw ? parseDsn(raw) : null;
	return cachedDsn;
};

// Best-effort V8 stack-trace parse ("    at fn (file:line:col)") into
// Sentry's frame shape, oldest-first (V8 prints newest-first). Imperfect
// parsing still leaves a usable event — the raw string also goes in `extra`
// as a fallback (see buildExceptionEvent below).
const STACK_LINE = /^\s*at\s+(?:(.*?)\s+\()?(.*):(\d+):(\d+)\)?$/;
const parseStackFrames = (stack: string): { filename: string; function: string; lineno: number; colno: number }[] => {
	const lines = stack.split("\n").slice(1); // drop the "Error: message" line
	const frames = [];
	for (const line of lines) {
		const match = STACK_LINE.exec(line);
		if (!match) continue;
		const [, fn, filename, lineno, colno] = match;
		frames.push({
			function: fn || "<anonymous>",
			filename: filename ?? "",
			lineno: Number(lineno),
			colno: Number(colno),
		});
	}
	return frames.reverse();
};

type EventPayload = Record<string, unknown>;

// Generated up front (rather than inside baseEvent) so callers can hand the
// same id back to whoever hit the endpoint — a human-relayable reference that
// also happens to be exactly what Sentry's event search expects.
const newEventId = (): string => randomUUID().replace(/-/g, "");

const baseEvent = (level: SentryLevel, tags: Record<string, string>, eventId: string): EventPayload => ({
	event_id: eventId,
	timestamp: new Date().toISOString(),
	platform: "node",
	level,
	environment: process.env.CONTEXT ?? "development",
	tags,
});

const buildExceptionEvent = (err: Error, level: SentryLevel, tags: Record<string, string>, eventId: string, extra?: Record<string, unknown>): EventPayload => ({
	...baseEvent(level, tags, eventId),
	exception: {
		values: [
			{
				type: err.name || "Error",
				value: err.message,
				stacktrace: err.stack ? { frames: parseStackFrames(err.stack) } : undefined,
			},
		],
	},
	extra: { ...extra, rawStack: err.stack ?? null },
});

const buildMessageEvent = (message: string, level: SentryLevel, tags: Record<string, string>, eventId: string, extra?: Record<string, unknown>): EventPayload => ({
	...baseEvent(level, tags, eventId),
	message: { formatted: message },
	extra,
});

// Fire-and-forget would risk the function's execution context freezing
// before the request actually leaves the process (a real risk in
// serverless — nothing keeps a background promise alive past the response).
// Every call site below awaits this instead, so delivery happens before the
// handler returns. Never throws — a broken/unconfigured Sentry DSN must
// never break the caller (same contract as lib/mailer.ts's notify* helpers).
const send = async (event: EventPayload): Promise<void> => {
	const dsn = getDsn();
	if (!dsn) return; // Not configured — silent no-op, never a boot-time crash.

	const envelopeHeader = JSON.stringify({ event_id: event["event_id"], sent_at: new Date().toISOString() });
	const itemHeader = JSON.stringify({ type: "event", content_type: "application/json" });
	const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}\n`;

	try {
		const response = await fetch(dsn.envelopeUrl, {
			method: "POST",
			headers: {
				"content-type": "application/x-sentry-envelope",
				"x-sentry-auth": `Sentry sentry_version=7, sentry_client=cabin-between-rivers/1.0.0, sentry_key=${dsn.publicKey}`,
			},
			body,
		});
		if (!response.ok) {
			console.error(`lib/sentry: Sentry rejected event ${response.status}`, await response.text().catch(() => ""));
		}
	} catch (e) {
		console.error("lib/sentry: failed to deliver event to Sentry", e);
	}
};

// Catch-all for lib/http.ts's withErrorHandling/withScheduledErrorHandling —
// anything that escaped a handler unhandled. `endpoint` tags the event so
// Sentry groups/filters by function name instead of every 500 in one bucket.
// Returns the event id so the caller can surface it as a reference — to the
// person who hit the error (in the response) and in its own server log line
// — letting a vague "something went wrong" report be traced to one exact
// Sentry event instead of guessed at.
export const reportError = async (err: unknown, endpoint: string): Promise<string> => {
	const eventId = newEventId();
	const tags = { endpoint };
	if (err instanceof Error) {
		await send(buildExceptionEvent(err, "error", tags, eventId));
	} else {
		await send(buildMessageEvent(`Non-Error thrown in ${endpoint}: ${String(err)}`, "error", tags, eventId));
	}
	return eventId;
};

// For the explicit CRITICAL call sites (stripe-webhook.mts,
// admin-cancel-reservation.mts, cancel-my-reservation.mts) — states that are
// already caught and handled (the caller gets a normal Response), reported
// here purely so a developer gets paged. `extra` must only ever carry
// structural identifiers (reservationId, a Stripe event id, booleans) — never
// guestName/guestEmail/idPhotoBlobKey or a token. `err` is optional since a
// couple of these sites are data-integrity guards with no caught exception to
// attach (see cancel-my-reservation.mts's missing-stripePaymentIntentId case).
// Also returns the event id (see reportError above) — the CRITICAL call
// sites all return a "please contact us" / "fix this manually" message to a
// guest or admin, and the id gives them something concrete to relay back.
export const reportCritical = async (
	message: string,
	extra: Record<string, string | number | boolean | null>,
	err?: unknown
): Promise<string> => {
	const eventId = newEventId();
	const tags = { critical: "true" };
	if (err instanceof Error) {
		await send(buildExceptionEvent(err, "fatal", tags, eventId, extra));
	} else {
		await send(buildMessageEvent(message, "fatal", tags, eventId, extra));
	}
	return eventId;
};
