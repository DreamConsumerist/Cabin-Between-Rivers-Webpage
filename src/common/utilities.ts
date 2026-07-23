export const isProduction = import.meta.env.MODE === "production";

// Shared fetch wrapper for the site's Netlify Functions API: parses the JSON
// body and throws the server's `error` message (falling back to the status)
// when the response isn't ok.
export const jsonFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(url, init);
	const data: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			data && typeof data === "object" && "error" in data && typeof data.error === "string"
				? data.error
				: `Request failed (${response.status})`;
		throw new Error(message);
	}
	return data as T;
};
