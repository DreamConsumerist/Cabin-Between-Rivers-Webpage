import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, parseJsonBody } from "../../lib/http";
import { requireAdmin } from "../../lib/adminAuth";
import { getConflictById, listConflicts, reopenConflict, resolveConflict } from "../../lib/conflicts";

const resolveSchema = z.object({
	id: z.number().int().positive(),
	resolved: z.boolean(),
	note: z.string().trim().max(2000).optional(),
});

// GET /api/admin-conflicts?resolved=false|true — omit for all.
const handleList = async (req: Request): Promise<Response> => {
	const param = new URL(req.url).searchParams.get("resolved");
	const resolved = param === "true" ? true : param === "false" ? false : undefined;
	return json({ conflicts: await listConflicts({ resolved }) });
};

// PATCH /api/admin-conflicts — { id, resolved: true, note? } marks resolved;
// { id, resolved: false } reopens it.
const handleUpdate = async (req: Request): Promise<Response> => {
	const parsedBody = await parseJsonBody(req);
	if (!parsedBody.ok) return parsedBody.response;

	const parsed = resolveSchema.safeParse(parsedBody.body);
	if (!parsed.success) return json({ error: "Invalid conflict update", issues: parsed.error.issues }, 400);

	const existing = await getConflictById(parsed.data.id);
	if (!existing) return error("Conflict not found", 404);

	const conflict = parsed.data.resolved
		? await resolveConflict(parsed.data.id, parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null)
		: await reopenConflict(parsed.data.id);
	return json({ conflict });
};

// GET/PATCH /api/admin-conflicts — the double-booking reconciliation tool's
// conflict list (see lib/conflicts.ts). Both methods require an admin
// session. No POST/DELETE — conflicts are only ever system-created, never
// admin-created or deleted.
export default async (req: Request, _context: Context): Promise<Response> => {
	const unauthorized = requireAdmin(req);
	if (unauthorized) return unauthorized;

	try {
		switch (req.method) {
			case "GET":
				return await handleList(req);
			case "PATCH":
				return await handleUpdate(req);
			default:
				return error("Method not allowed", 405);
		}
	} catch (e) {
		console.error("admin-conflicts failed", e);
		return error("Request failed", 500);
	}
};
