import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { reservations } from "../../db/schema";
import { getReservationsNeedingGuestEmailScheduling, getSettings } from "../../lib/availability";
import { withScheduledErrorHandling } from "../../lib/http";
import { scheduleCheckInReminder, scheduleCheckOutReminder } from "../../lib/mailer";

// Catch-all for reservations booked further ahead than Resend's scheduling
// window allows at confirmation time (see stripe-webhook.mts and
// lib/mailer.ts's MAX_SCHEDULE_DAYS) — sweeps for any confirmed reservation
// still missing a scheduled reminder and schedules whichever is now within
// range. Twice a month (1st/15th, the standard cron idiom for "every two
// weeks" — cron has no native every-N-days interval) rather than weekly:
// comfortable margin under the 30-day cap without the extra runs a weekly
// schedule would cost. A reservation booked and stayed within one interval
// between runs never depends on this at all — it's always scheduled
// immediately at booking-confirmation time instead.
export default withScheduledErrorHandling("schedule-guest-emails", async () => {
	const [settings, candidates] = await Promise.all([
		getSettings(),
		getReservationsNeedingGuestEmailScheduling(),
	]);

	for (const reservation of candidates) {
		const [checkInEmailId, checkOutEmailId] = await Promise.all([
			reservation.checkInEmailId ? Promise.resolve(reservation.checkInEmailId) : scheduleCheckInReminder(reservation, settings),
			reservation.checkOutEmailId ? Promise.resolve(reservation.checkOutEmailId) : scheduleCheckOutReminder(reservation, settings),
		]);

		if (checkInEmailId !== reservation.checkInEmailId || checkOutEmailId !== reservation.checkOutEmailId) {
			await db
				.update(reservations)
				.set({
					...(checkInEmailId ? { checkInEmailId } : {}),
					...(checkOutEmailId ? { checkOutEmailId } : {}),
				})
				.where(eq(reservations.id, reservation.id));
		}
	}
});

export const config: Config = { schedule: "0 6 1,15 * *" };
