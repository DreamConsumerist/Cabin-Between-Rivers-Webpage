import { createHmac, timingSafeEqual } from "node:crypto";
import { error } from "./http";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const getEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

// Fixed-length digest comparison so neither branch length nor early-exit
// timing leaks how much of the candidate matched. Exported for
// netlify/functions/calendar-export.mts, which gates a public endpoint on a
// token rather than a session cookie but needs the same timing-safe check.
export const constantTimeEquals = (a: string, b: string): boolean => {
	const digestA = createHmac("sha256", "compare").update(a).digest();
	const digestB = createHmac("sha256", "compare").update(b).digest();
	return timingSafeEqual(digestA, digestB);
};

export const verifyAdminPassword = (candidate: string): boolean =>
	constantTimeEquals(candidate, getEnv("ADMIN_PASSWORD"));

const sign = (payload: string): string =>
	createHmac("sha256", getEnv("ADMIN_SESSION_SECRET"))
		.update(payload)
		.digest("hex");

const createSessionToken = (): string => {
	const expiresAt = Date.now() + SESSION_TTL_MS;
	const payload = String(expiresAt);
	return `${payload}.${sign(payload)}`;
};

const verifySessionToken = (token: string): boolean => {
	const [payload, signature] = token.split(".");
	if (!payload || !signature) return false;
	if (!constantTimeEquals(signature, sign(payload))) return false;
	const expiresAt = Number(payload);
	return Number.isFinite(expiresAt) && Date.now() < expiresAt;
};

const getCookie = (req: Request, name: string): string | null => {
	const header = req.headers.get("cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return rest.join("=");
	}
	return null;
};

// Cookies marked Secure are rejected by browsers when set over plain HTTP, so
// only add it when the request itself arrived over HTTPS (true in production,
// false for local `netlify dev`).
const cookieAttributes = (req: Request, maxAgeSeconds: number): string => {
	const secure = new URL(req.url).protocol === "https:" ? " Secure;" : "";
	return `Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${maxAgeSeconds}`;
};

export const setSessionCookieHeader = (req: Request): string =>
	`${COOKIE_NAME}=${createSessionToken()}; ${cookieAttributes(req, SESSION_TTL_MS / 1000)}`;

export const clearSessionCookieHeader = (req: Request): string =>
	`${COOKIE_NAME}=; ${cookieAttributes(req, 0)}`;

export const isAdminAuthenticated = (req: Request): boolean => {
	const token = getCookie(req, COOKIE_NAME);
	return token !== null && verifySessionToken(token);
};

// Guard for admin-only endpoints — returns a 401 Response to short-circuit the
// handler, or null when the caller is authenticated.
export const requireAdmin = (req: Request): Response | null =>
	isAdminAuthenticated(req) ? null : error("Unauthorized", 401);
