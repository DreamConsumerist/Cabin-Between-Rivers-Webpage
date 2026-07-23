import type { Config } from "@netlify/functions";
import { expireLapsedHolds } from "../../lib/availability";

// Scheduled cleanup: frees pending reservations whose hold has lapsed.
// This is a backstop (create-booking also expires lapsed holds on demand) that
// keeps the availability calendar tidy. Scheduled functions run only on
// production deploys, in UTC, and return no response body.
export default async (): Promise<void> => {
	await expireLapsedHolds();
};

export const config: Config = { schedule: "*/5 * * * *" };
