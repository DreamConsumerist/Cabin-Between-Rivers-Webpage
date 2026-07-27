import { z } from "zod";
import { error, json, parseJsonBody, withErrorHandling } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getSettings, updateConfigurationSwitching } from "../../lib/availability";

const updateSchema = z.object({
	configurationSwitchingEnabled: z.boolean(),
});

// GET/PUT /api/admin-settings — the configuration-switching toggle behind the
// settings table (see db/schema.ts). Per-configuration pricing lives on
// bookingConfigurations instead (see admin-booking-configurations.mts). Both
// methods require an admin session.
export default withErrorHandling("admin-settings", async (req, _context) => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	if (req.method === "GET") {
		return json({ settings: await getSettings() });
	}

	if (req.method === "PUT") {
		const parsedBody = await parseJsonBody(req);
		if (!parsedBody.ok) return parsedBody.response;

		const parsed = updateSchema.safeParse(parsedBody.body);
		if (!parsed.success) return json({ error: "Invalid settings", issues: parsed.error.issues }, 400);

		const settings = await updateConfigurationSwitching(parsed.data);
		return json({ settings });
	}

	return error("Method not allowed", 405);
});
