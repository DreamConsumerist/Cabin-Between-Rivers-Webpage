import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

// `netlify dev`'s built-in local database is PGlite (Postgres compiled to
// WASM), which has almost no extensions compiled in — no btree_gist,
// pg_trgm, etc. — and netlify-cli has no config flag to point that feature
// at an external Postgres instead (it unconditionally spawns PGlite and
// overwrites NETLIFY_DB_URL with its own connection string on every `netlify
// dev` start). So instead of fighting that, this spins up a real Postgres
// (via the `embedded-postgres` npm package, which ships actual Postgres
// binaries — including the full contrib extension set) as a separate
// process on its own port. db/client.ts prefers LOCAL_DATABASE_URL over
// NETLIFY_DB_URL when it's set, so `netlify dev` can keep running normally
// (its own PGlite instance just goes unused) while functions talk to this
// instead.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATABASE_DIR = path.join(ROOT, ".localdb");
const PORT = 5433;
const DATABASE_NAME = "cabin_dev";
const USER = "postgres";
const PASSWORD = "postgres";

export const LOCAL_DATABASE_URL = `postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE_NAME}`;

const pg = new EmbeddedPostgres({
	databaseDir: DATABASE_DIR,
	user: USER,
	password: PASSWORD,
	port: PORT,
	persistent: true,
});

// On Windows, spawning a .CMD file needs shell:true — but passing shell:true
// together with a separate args array makes Node warn that args aren't
// escaped for the shell (there's no user input here, so no actual injection
// risk, but the fix is simple: fold everything into one command string, which
// is the form Node expects when shell is true).
const run = (command, args) =>
	new Promise((resolve, reject) => {
		const useShell = process.platform === "win32";
		const child = useShell
			? spawn(`"${command}" ${args.join(" ")}`, { stdio: "inherit", env: { ...process.env, LOCAL_DATABASE_URL }, shell: true })
			: spawn(command, args, { stdio: "inherit", env: { ...process.env, LOCAL_DATABASE_URL } });
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
		});
	});

if (!existsSync(path.join(DATABASE_DIR, "PG_VERSION"))) {
	console.log(`Initializing local Postgres cluster in ${DATABASE_DIR}...`);
	await pg.initialise();
}

await pg.start();

try {
	await pg.createDatabase(DATABASE_NAME);
} catch (err) {
	// Already exists on every run after the first — that's expected, not an error.
	if (!String(err).includes("already exists")) throw err;
}

console.log(`Local Postgres ready: ${LOCAL_DATABASE_URL}`);
console.log("Applying migrations (drizzle-kit migrate)...");
const drizzleKitBin = path.join(
	ROOT,
	"node_modules",
	".bin",
	process.platform === "win32" ? "drizzle-kit.CMD" : "drizzle-kit"
);
await run(drizzleKitBin, ["migrate"]);
console.log("Migrations applied. Leave this running — Ctrl+C to stop the database.");

// embedded-postgres runs the server as its own child process and only shuts
// it down via the exit hook registered on this Node process, so this script
// needs to stay alive for as long as the database should.
await new Promise(() => {});
