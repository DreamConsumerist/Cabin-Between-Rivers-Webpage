import { json, requireMethod, withErrorHandling } from "../../lib/http";
import { clearSessionCookieHeader } from "../../lib/adminAuth";

// POST /api/admin-logout -> clears the admin session cookie.
export default withErrorHandling("admin-logout", async (req, _context) => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	const response = json({ ok: true });
	response.headers.set("set-cookie", clearSessionCookieHeader(req));
	return response;
});
