import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, parseJsonBody } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getSettings, updateTermsContent } from "../../lib/availability";
import { DEFAULT_TERMS_CONTENT } from "../../lib/terms";

const updateSchema = z.object({
	termsContent: z.string().trim().min(1, "Terms content is required").max(20_000),
});

// GET/PUT /api/admin-terms — the Terms & Conditions text shown to guests via
// /api/terms. Both methods require an admin session.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	if (req.method === "GET") {
		const settings = await getSettings();
		// The effective (possibly-default) content, so the editor always shows
		// what a guest would actually see, not a blank box before it's customized.
		const termsContent = settings?.termsContent?.trim() || DEFAULT_TERMS_CONTENT;
		return json({ termsContent });
	}

	if (req.method === "PUT") {
		const parsedBody = await parseJsonBody(req);
		if (!parsedBody.ok) return parsedBody.response;

		const parsed = updateSchema.safeParse(parsedBody.body);
		if (!parsed.success) return json({ error: "Invalid terms", issues: parsed.error.issues }, 400);

		const updated = await updateTermsContent(parsed.data.termsContent);
		return json({ termsContent: updated.termsContent });
	}

	return error("Method not allowed", 405);
};
