import type { Context } from "@netlify/functions";
import { json, requireMethod } from "../../lib/http";
import { clearSessionCookieHeader } from "../../lib/adminAuth";

// POST /api/admin-logout -> clears the admin session cookie.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	const response = json({ ok: true });
	response.headers.set("set-cookie", clearSessionCookieHeader(req));
	return response;
};
