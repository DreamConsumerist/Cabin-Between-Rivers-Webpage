# Agent notes for this repo

## Local dev server (`netlify dev`)

The local dev stack is `netlify dev` (proxies on `:8888`) fronting a Vite dev
server (`:5173`) and the Netlify Functions, plus an embedded local Postgres
emulator ("Netlify Database", PGlite-based) whose data lives in `.netlify/db`.

### Don't restart it reflexively

`netlify dev` hot-reloads both Vite (HMR) and the Netlify Functions (you'll
see `Reloaded function X` in its log) on every file save. Editing code is
**not** a reason to stop/restart it — if one is already running, leave it
running and just make your edits.

Before starting a new one, check whether one's already up:

```sh
netstat -ano | grep -E ':8888|:5173' | grep LISTENING
```

If it is, don't start a second instance.

### If you must stop it

Force-killing the parent process (`Stop-Process -Force`, `kill -9`) does not
give the embedded local Postgres emulator a chance to flush/close cleanly.
This has repeatedly corrupted `.netlify/db`, and afterward **every**
`netlify dev` boot — including `netlify database reset` itself — fails at
startup with:

```
Failed to start Netlify Database locally: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
```

...which then 500s every DB-backed function (`NETLIFY_DB_URL environment
variable is not set`, since the emulator never came up to provide it).

Prefer, in order:

1. If it's a harness-tracked background task, stop it via the harness's own
   task-stop mechanism rather than a raw OS kill — more likely to let the
   process shut down gracefully.
2. If you must kill the OS process directly, try a plain `Stop-Process`
   (no `-Force`) or `taskkill` (no `/F`) first.
3. Only use `-Force`/`/F`/`kill -9` as a last resort, and if you do, treat the
   local DB as suspect afterward — check it actually came back up (see below)
   before assuming a restart succeeded.

### If it's already corrupted

Symptom: the dev server starts, Vite comes up fine, but the log shows
`Failed to start Netlify Database locally: RuntimeError: Aborted()`, and
every DB-backed function 500s. Deleting the stale `.netlify/db/postmaster.pid`
lock file alone does **not** fix this once it's actually corrupted (only
helps for a lock left over from a truly last-second kill). Upgrading
`netlify-cli` also does not fix it — this was tried (26.2.0 → 27.0.0) with no
change, so don't waste time on that. `netlify database reset` will not fix it
either — it also needs to boot the same broken engine first, so it fails
identically.

The actual fix is to wipe the data directory and let it reinitialize from
scratch, then reapply migrations. **Confirm with the user first** — this
wipes all local dev/test data (bookings, settings, gallery entries, etc.):

```sh
rm -rf .netlify/db
netlify dev                       # boots clean, recreates an empty local Postgres
# once "Local dev server ready" shows and there's no "Failed to start" line:
netlify database migrations apply # re-applies every migration to the fresh DB
```

Verify with `netlify db status` (should show all migrations applied) and a
quick `curl` against any admin endpoint (expect `401 Unauthorized`, not `500`).
