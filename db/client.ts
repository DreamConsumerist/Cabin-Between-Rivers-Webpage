import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema";

// Netlify's Drizzle adapter reads NETLIFY_DATABASE_URL automatically and picks
// the right Postgres driver for the runtime: the Neon HTTP driver inside
// serverless functions, and node-postgres for the local `netlify dev` database.
export const db = drizzle({ schema });
