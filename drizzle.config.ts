import { defineConfig } from "drizzle-kit";

// Migrations use the UNPOOLED/direct connection (DDL and session state don't
// work correctly through the pooled URL). Run drizzle-kit with the Netlify env
// injected, e.g.:  netlify dev:exec -- pnpm db:generate
export default defineConfig({
	dialect: "postgresql",
	schema: "./db/schema.ts",
	out: "./netlify/database/migrations",
	dbCredentials: {
		url:
			process.env.NETLIFY_DATABASE_URL_UNPOOLED ??
			process.env.NETLIFY_DATABASE_URL ??
			"",
	},
});
