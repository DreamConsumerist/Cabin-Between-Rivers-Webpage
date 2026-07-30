import { z } from "zod";
import { error, json, parseJsonBody, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getSettings, updateGuestEmailSettings } from "../../lib/availability";
import { DEFAULT_CHECKIN_INSTRUCTIONS, DEFAULT_CHECKOUT_INSTRUCTIONS } from "../../lib/guestEmails";

const hourSchema = z.number().int().min(0).max(23);

const updateSchema = z.object({
	checkInInstructions: z.string().trim().min(1, "Check-in instructions are required").max(20_000),
	checkOutInstructions: z.string().trim().min(1, "Check-out instructions are required").max(20_000),
	checkInReminderHour: hourSchema,
	checkOutReminderHour: hourSchema,
});

// GET/PUT /api/admin-guest-emails — the arrival/checkout reminder email
// content and AKST send hour (see db/schema.ts, lib/mailer.ts) behind the
// settings table. Both methods require an admin session. Same
// "effective (possibly-default) content" GET shape as admin-terms.mts.
export default withErrorHandling("admin-guest-emails", async (req, _context) => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	if (req.method === "GET") {
		const settings = await getSettings();
		return json({
			checkInInstructions: settings?.checkInInstructions?.trim() || DEFAULT_CHECKIN_INSTRUCTIONS,
			checkOutInstructions: settings?.checkOutInstructions?.trim() || DEFAULT_CHECKOUT_INSTRUCTIONS,
			checkInReminderHour: settings?.checkInReminderHour ?? 9,
			checkOutReminderHour: settings?.checkOutReminderHour ?? 8,
		});
	}

	if (req.method === "PUT") {
		const parsedBody = await parseJsonBody(req);
		if (!parsedBody.ok) return parsedBody.response;

		const parsed = updateSchema.safeParse(parsedBody.body);
		if (!parsed.success)
			return json({ error: "Invalid guest email settings", issues: parsed.error.issues }, 400);

		const updated = await updateGuestEmailSettings(parsed.data);
		return json({
			checkInInstructions: updated.checkInInstructions?.trim() || DEFAULT_CHECKIN_INSTRUCTIONS,
			checkOutInstructions: updated.checkOutInstructions?.trim() || DEFAULT_CHECKOUT_INSTRUCTIONS,
			checkInReminderHour: updated.checkInReminderHour ?? 9,
			checkOutReminderHour: updated.checkOutReminderHour ?? 8,
		});
	}

	return error("Method not allowed", 405);
});
