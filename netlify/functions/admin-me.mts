import type { Context } from "@netlify/functions";
import { json, requireMethod } from "../../lib/http";
import { isAdminAuthenticated } from "../../lib/adminAuth";

// GET /api/admin-me -> { authenticated } — lets the admin SPA know whether to
// show the login form or the dashboard on load, without a 401 either way.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	return json({ authenticated: isAdminAuthenticated(req) });
};
