import { json, withErrorHandling } from "../../lib/http";

// Health check — verifies the Functions runtime is live.
// Reachable at /.netlify/functions/health and (via netlify.toml redirect) /api/health
export default withErrorHandling("health", async (_req, _context) => {
	return json({
		ok: true,
		service: "cabin-between-rivers",
		timestamp: new Date().toISOString(),
	});
});
