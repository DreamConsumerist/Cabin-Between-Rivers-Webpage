import type { Config } from "@netlify/functions";
import { syncCalendars } from "../../lib/icalSync";

// Scheduled iCal sync: pulls the Airbnb/Vrbo .ics feeds into external_blocks
// so those dates block the site's own availability (see lib/icalSync.ts).
// External calendars don't need 5-minute freshness like holds do (compare
// expire-holds.mts), but should stay reasonably fresh to minimize the
// double-booking window — every 30 minutes. Scheduled functions run only on
// production deploys, in UTC, and return no response body.
export default async (): Promise<void> => {
	try {
		const summary = await syncCalendars();
		for (const result of summary.results) {
			if (!result.ok) console.error(`ical-sync: ${result.source} sync failed`, result.error);
		}
	} catch (e) {
		console.error("ical-sync: unexpected failure", e);
	}
};

export const config: Config = { schedule: "*/30 * * * *" };
