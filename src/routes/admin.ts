import { createFileRoute } from "@tanstack/react-router";
import { Admin } from "../pages/Admin";

export const Route = createFileRoute("/admin")({
	component: Admin,
	// Not linked from anywhere public, but noindex is the real guarantee
	// against it ever showing in search results (unlike robots.txt's
	// Disallow, which only stops crawling and can't prevent a URL discovered
	// some other way from still being listed) — see SETUP.md.
	head: () => ({
		meta: [{ name: "robots", content: "noindex" }],
	}),
});
