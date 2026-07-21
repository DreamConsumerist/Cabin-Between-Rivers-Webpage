// Small helpers for JSON responses from Netlify Functions.

export const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});

export const error = (message: string, status = 400): Response =>
	json({ error: message }, status);

// Guard a function to a single HTTP method; returns a 405 Response if it doesn't match.
export const requireMethod = (req: Request, method: string): Response | null =>
	req.method === method ? null : error(`Method not allowed`, 405);
