import type { Config } from "@netlify/functions";
import { withScheduledErrorHandling } from "../../lib/http";
import { syncCalendars } from "../../lib/icalSync";

// Scheduled iCal sync: pulls the Airbnb/Vrbo .ics feeds into external_blocks
// so those dates block the site's own availability (see lib/icalSync.ts).
// This is the only remaining cron in the app (holds are expired on demand,
// not on a timer — see expireLapsedHolds callers) — hourly gives the
// database a longer idle window between runs (vs. every 30 minutes) to stay
// scaled to zero and keep compute credits down, at the cost of a larger
// double-booking window. Scheduled functions run only on production
// deploys, in UTC, and return no response body.
export default withScheduledErrorHandling("ical-sync", async () => {
	const summary = await syncCalendars();
	for (const result of summary.results) {
		if (!result.ok) console.error(`ical-sync: ${result.source} sync failed`, result.error);
	}
});

export const config: Config = { schedule: "0 * * * *" };
