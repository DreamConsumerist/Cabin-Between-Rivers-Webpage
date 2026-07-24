import ical, { type CalendarResponse } from "node-ical";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { externalBlocks } from "../db/schema";
import { getActiveReservationsOverlapping, getSettings } from "./availability";
import { notifyDoubleBooking } from "./mailer";

export type IcalSource = "airbnb" | "vrbo";

export type ParsedBlock = { uid: string; checkIn: string; checkOut: string };

// UTC-safe extraction: node-ical parses VALUE=DATE (all-day) DTSTART/DTEND as
// Date objects representing UTC midnight of that calendar day (marked with
// `.dateOnly = true`). Using UTC getters (not local getters) avoids an
// off-by-one day in timezones behind UTC.
const toIsoDate = (date: Date): string => {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const addOneDay = (isoDate: string): string => {
	const date = new Date(`${isoDate}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return toIsoDate(date);
};

// Maps a parsed calendar (an object keyed by uid, per node-ical) into our
// block shape. Airbnb/Vrbo block events are all-day; DTEND is already
// exclusive, matching this codebase's [checkIn, checkOut) convention used
// everywhere else (see `overlaps()` in lib/availability.ts).
const toParsedBlocks = (calendar: CalendarResponse): ParsedBlock[] => {
	const blocks: ParsedBlock[] = [];
	for (const component of Object.values(calendar)) {
		if (!component || component.type !== "VEVENT") continue;
		const event = component;
		if (!event.uid || !event.start) continue; // RFC 5545 requires both; skip malformed entries
		// Airbnb/Vrbo don't reliably remove cancelled blocks from the feed —
		// treat STATUS:CANCELLED as absent so it's pruned like a removed event.
		if (event.status === "CANCELLED") continue;

		const checkIn = toIsoDate(event.start);
		// RFC 5545: a VALUE=DATE event with no DTEND has an implicit one-day
		// duration.
		const checkOut = event.end ? toIsoDate(event.end) : addOneDay(checkIn);

		blocks.push({ uid: event.uid, checkIn, checkOut });
	}
	return blocks;
};

// Parses raw .ics text — no network. Exported for unit tests.
export const parseIcsText = (icsText: string): ParsedBlock[] => toParsedBlocks(ical.sync.parseICS(icsText));

// Fetches + parses a remote .ics URL. Throws on network failure or
// unparsable content — syncSource below must catch this per source so a
// transient failure never prunes/touches existing rows for that source.
export const fetchIcsBlocks = async (url: string): Promise<ParsedBlock[]> =>
	toParsedBlocks(await ical.async.fromURL(url));

export type ExistingBlockRow = { uid: string; checkIn: string; checkOut: string };

export type BlockDiff = {
	inserted: ParsedBlock[];
	updated: ParsedBlock[];
	unchanged: ParsedBlock[];
};

// Classifies each incoming block against the rows currently stored for this
// source. "updated" means checkIn/checkOut actually changed — this is what
// drives conflict re-checking, so an unchanged, already-flagged block never
// re-alerts on every sync.
export const diffBlocks = (incoming: ParsedBlock[], existing: ExistingBlockRow[]): BlockDiff => {
	const existingByUid = new Map(existing.map((row) => [row.uid, row]));
	const diff: BlockDiff = { inserted: [], updated: [], unchanged: [] };
	for (const block of incoming) {
		const prev = existingByUid.get(block.uid);
		if (!prev) diff.inserted.push(block);
		else if (prev.checkIn !== block.checkIn || prev.checkOut !== block.checkOut) diff.updated.push(block);
		else diff.unchanged.push(block);
	}
	return diff;
};

export type SourceSyncResult = {
	source: IcalSource;
	ok: boolean;
	eventCount: number;
	inserted: number;
	updated: number;
	pruned: number;
	conflicts: number;
	error?: string;
};

export const syncSource = async (source: IcalSource, url: string): Promise<SourceSyncResult> => {
	let incoming: ParsedBlock[];
	try {
		incoming = await fetchIcsBlocks(url);
	} catch (e) {
		console.error(`ical-sync: fetch/parse failed for ${source}`, e);
		return {
			source,
			ok: false,
			eventCount: 0,
			inserted: 0,
			updated: 0,
			pruned: 0,
			conflicts: 0,
			error: e instanceof Error ? e.message : String(e),
		};
	}

	const existing = await db
		.select({ uid: externalBlocks.uid, checkIn: externalBlocks.checkIn, checkOut: externalBlocks.checkOut })
		.from(externalBlocks)
		.where(eq(externalBlocks.source, source));

	const { inserted, updated, unchanged } = diffBlocks(incoming, existing);

	// One row per upsert (not a bulk multi-row upsert): Drizzle's bulk `.set()`
	// on onConflictDoUpdate takes literal values, not per-row `excluded.*`
	// references, so a single batched insert().onConflictDoUpdate({ set })
	// would wrongly apply one row's dates to every conflicting row in the
	// batch. Feed sizes here are small (tens of events), so sequential
	// round-trips are fine. This is the first composite-target
	// onConflictDoUpdate in the codebase — see stripe-webhook.mts's
	// onConflictDoNothing for the single-column precedent.
	for (const block of [...inserted, ...updated]) {
		await db
			.insert(externalBlocks)
			.values({
				source,
				uid: block.uid,
				checkIn: block.checkIn,
				checkOut: block.checkOut,
				lastSyncedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [externalBlocks.source, externalBlocks.uid],
				set: { checkIn: block.checkIn, checkOut: block.checkOut, lastSyncedAt: new Date() },
			});
	}
	// Bump lastSyncedAt for unchanged rows too, for staleness observability —
	// no upsert needed, they already exist.
	for (const block of unchanged) {
		await db
			.update(externalBlocks)
			.set({ lastSyncedAt: new Date() })
			.where(and(eq(externalBlocks.source, source), eq(externalBlocks.uid, block.uid)));
	}

	// Conflict detection: only newly-inserted or changed blocks, so an
	// unresolved conflict isn't re-emailed on every sync.
	let conflicts = 0;
	for (const block of [...inserted, ...updated]) {
		const overlapping = await getActiveReservationsOverlapping(block.checkIn, block.checkOut);
		if (overlapping.length > 0) {
			conflicts++;
			await notifyDoubleBooking({
				source: source === "airbnb" ? "airbnb-sync" : "vrbo-sync",
				checkIn: block.checkIn,
				checkOut: block.checkOut,
				detail: `External ${source} block (uid ${block.uid}) overlaps reservation(s) #${overlapping
					.map((r) => r.id)
					.join(", #")}.`,
			});
		}
	}

	// Prune stale rows — only reached after a SUCCESSFUL fetch+parse (the
	// catch above already returned early), so a transient failure never
	// reopens availability that's actually still blocked. Special-case an
	// empty result set: `notInArray` with zero elements is invalid SQL, and
	// an empty feed legitimately means "delete everything for this source".
	const seenUids = incoming.map((b) => b.uid);
	const pruned =
		seenUids.length === 0
			? (
					await db
						.delete(externalBlocks)
						.where(eq(externalBlocks.source, source))
						.returning({ id: externalBlocks.id })
				).length
			: (
					await db
						.delete(externalBlocks)
						.where(and(eq(externalBlocks.source, source), notInArray(externalBlocks.uid, seenUids)))
						.returning({ id: externalBlocks.id })
				).length;

	return {
		source,
		ok: true,
		eventCount: incoming.length,
		inserted: inserted.length,
		updated: updated.length,
		pruned,
		conflicts,
	};
};

export type IcalSyncSummary = { syncedAt: string; results: SourceSyncResult[] };

// The single shared entry point for all three triggers (admin save, manual
// "Sync now" button, scheduled cron) — see netlify/functions/admin-ical.mts,
// admin-ical-sync.mts, and ical-sync.mts. Only runs for sources with a
// configured URL. Note: syncSource's try/catch only wraps its fetch/parse
// step — a DB error during the upsert/query/prune calls propagates out of
// here uncaught, so every caller wraps its own call to this function.
export const syncCalendars = async (): Promise<IcalSyncSummary> => {
	const settings = await getSettings();
	const results: SourceSyncResult[] = [];
	if (settings?.airbnbIcalUrl) results.push(await syncSource("airbnb", settings.airbnbIcalUrl));
	if (settings?.vrboIcalUrl) results.push(await syncSource("vrbo", settings.vrboIcalUrl));
	return { syncedAt: new Date().toISOString(), results };
};
