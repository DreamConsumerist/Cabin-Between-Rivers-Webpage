import { defineConfig } from "drizzle-kit";

// Migrations use the UNPOOLED/direct connection (DDL and session state don't
// work correctly through the pooled URL). Run drizzle-kit with the Netlify env
// injected, e.g.:  netlify dev:exec -- pnpm db:generate
//
// LOCAL_DATABASE_URL (see scripts/local-db.mjs) is the last fallback, used
// only when neither Netlify var is present — i.e. plain `pnpm db:generate`/
// `drizzle-kit migrate` runs against the local Postgres substitute for
// netlify dev's PGlite, which can't run extension-requiring migrations.
export default defineConfig({
	dialect: "postgresql",
	schema: "./db/schema.ts",
	out: "./netlify/database/migrations",
	dbCredentials: {
		url:
			process.env.NETLIFY_DATABASE_URL_UNPOOLED ??
			process.env.NETLIFY_DATABASE_URL ??
			process.env.LOCAL_DATABASE_URL ??
			"",
	},
});
