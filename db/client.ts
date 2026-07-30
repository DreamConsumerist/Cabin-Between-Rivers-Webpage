import { drizzle as drizzleNetlifyDb } from "drizzle-orm/netlify-db";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Netlify's Drizzle adapter reads NETLIFY_DB_URL automatically and picks the
// right Postgres driver for the runtime: the Neon HTTP driver inside
// serverless functions, and node-postgres for the local `netlify dev`
// database. `netlify dev` always overwrites NETLIFY_DB_URL with its own
// PGlite instance on every start — no config flag redirects it — and PGlite
// has almost no Postgres extensions compiled in, so any migration needing
// one (e.g. btree_gist) can never apply locally. LOCAL_DATABASE_URL (see
// scripts/local-db.mjs) opts into a real local Postgres instead; it's unset
// in production and in default `netlify dev` use, where this behaves exactly
// as before.
export const db = process.env.LOCAL_DATABASE_URL
	? drizzleNodePostgres(process.env.LOCAL_DATABASE_URL, { schema })
	: drizzleNetlifyDb({ schema });
