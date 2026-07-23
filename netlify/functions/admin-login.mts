import type { Context } from "@netlify/functions";
import { z } from "zod";
import { error, json, requireMethod } from "../../lib/http";
import { setSessionCookieHeader, verifyAdminPassword } from "../../lib/adminAuth";

const bodySchema = z.object({ password: z.string().min(1) });

// POST /api/admin-login -> sets the admin session cookie on success.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "POST");
	if (notAllowed) return notAllowed;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return error("Invalid JSON body");
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) return error("Password is required");

	if (!verifyAdminPassword(parsed.data.password)) {
		return error("Incorrect password", 401);
	}

	const response = json({ ok: true });
	response.headers.set("set-cookie", setSessionCookieHeader(req));
	return response;
};
