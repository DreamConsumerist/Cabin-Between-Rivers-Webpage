import { neon } from "@netlify/neon";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// `neon()` reads NETLIFY_DATABASE_URL automatically (the pooled connection,
// correct for serverless functions). The HTTP driver is ideal for the short,
// one-shot queries a function makes.
const sql = neon();

export const db = drizzle({ client: sql, schema });
