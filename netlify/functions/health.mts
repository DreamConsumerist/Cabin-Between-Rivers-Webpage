import type { Context } from "@netlify/functions";

// Health check — verifies the Functions runtime is live.
// Reachable at /.netlify/functions/health and (via netlify.toml redirect) /api/health
export default async (_req: Request, _context: Context): Promise<Response> => {
	return Response.json({
		ok: true,
		service: "cabin-between-rivers",
		timestamp: new Date().toISOString(),
	});
};
