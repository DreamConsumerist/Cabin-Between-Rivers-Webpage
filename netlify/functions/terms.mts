import type { Context } from "@netlify/functions";
import { error, requireMethod } from "../../lib/http";
import { getSettings } from "../../lib/availability";
import { DEFAULT_TERMS_CONTENT, renderTermsHtml } from "../../lib/terms";

// GET /api/terms — the Terms & Conditions page embedded via iframe in the
// booking flow's Terms step (see src/features/booking/TermsStep.tsx). Public,
// no admin session required. Same-origin (served from this site's own /api/*)
// so TermsStep's scroll-to-bottom check can read the iframe's DOM directly.
export default async (req: Request, _context: Context): Promise<Response> => {
	const notAllowed = requireMethod(req, "GET");
	if (notAllowed) return notAllowed;

	try {
		const settings = await getSettings();
		const content = settings?.termsContent?.trim() || DEFAULT_TERMS_CONTENT;

		const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Terms &amp; Conditions</title>
<style>
	body {
		margin: 0;
		padding: 1.25rem 1.5rem;
		font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
		color: #2c2318;
		line-height: 1.6;
		font-size: 0.9rem;
	}
	h1 {
		font-size: 1.1rem;
		margin-top: 0;
	}
	h2 {
		font-size: 0.95rem;
		margin-top: 1.5rem;
		color: #5a462a;
	}
	p {
		margin: 0.5rem 0;
	}
</style>
</head>
<body>
${renderTermsHtml(content)}
</body>
</html>
`;

		return new Response(html, {
			status: 200,
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	} catch (e) {
		console.error("terms failed", e);
		return error("Could not load terms", 500);
	}
};
