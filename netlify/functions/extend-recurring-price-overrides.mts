import type { Config } from "@netlify/functions";
import { extendRecurringSeries } from "../../lib/priceOverrides";
import { withScheduledErrorHandling } from "../../lib/http";

// Scheduled: rolls every active recurring price-override series forward so
// its furthest instance stays ~2 years ahead of today. Runs once a year
// (extendRecurringSeries catches up on its own if a run is ever missed) —
// see lib/priceOverrides.ts for the series model.
export default withScheduledErrorHandling("extend-recurring-price-overrides", async () => {
	await extendRecurringSeries();
});

export const config: Config = { schedule: "0 0 1 1 *" };
