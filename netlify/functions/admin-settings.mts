import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, parseJsonBody } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getSettings, upsertSettings } from "../../lib/availability";

const updateSchema = z.object({
	nightlyRate: z.number().int().min(0),
	cleaningFee: z.number().int().min(0),
	minNights: z.number().int().min(1),
	airbnbIcalUrl: z.string().trim().url().or(z.literal("")),
	vrboIcalUrl: z.string().trim().url().or(z.literal("")),
});

// GET/PUT /api/admin-settings — the pricing + iCal config behind the settings
// table (see db/schema.ts). Both methods require an admin session.
export default async (req: Request, _context: Context): Promise<Response> => {
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

		const settings = await upsertSettings({
			nightlyRate: parsed.data.nightlyRate,
			cleaningFee: parsed.data.cleaningFee,
			minNights: parsed.data.minNights,
			airbnbIcalUrl: parsed.data.airbnbIcalUrl || null,
			vrboIcalUrl: parsed.data.vrboIcalUrl || null,
		});
		return json({ settings });
	}

	return error("Method not allowed", 405);
};
