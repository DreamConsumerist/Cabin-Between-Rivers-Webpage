import type { Config } from "@netlify/functions";
import { withScheduledErrorHandling } from "../../lib/http";
import { syncCalendars } from "../../lib/icalSync";

// Scheduled iCal sync: pulls the Airbnb/Vrbo .ics feeds into external_blocks
// so those dates block the site's own availability (see lib/icalSync.ts).
// This is the only remaining cron in the app (holds are expired on demand,
// not on a timer — see expireLapsedHolds callers) — every 30 minutes keeps
// the double-booking window reasonably small while comfortably exceeding
// Netlify DB's ~5-minute compute auto-suspend idle window, so the database
// still scales to zero between runs instead of staying active around the
// clock. Scheduled functions run only on production deploys, in UTC, and
// return no response body.
export default withScheduledErrorHandling("ical-sync", async () => {
	const summary = await syncCalendars();
	for (const result of summary.results) {
		if (!result.ok) console.error(`ical-sync: ${result.source} sync failed`, result.error);
	}
});

export const config: Config = { schedule: "*/30 * * * *" };
