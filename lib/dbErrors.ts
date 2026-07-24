// Postgres exclusion-violation error code — thrown when a GiST EXCLUDE
// constraint rejects an overlapping row (see reservations_no_overlap and
// price_overrides_no_overlap).
export const EXCLUSION_VIOLATION = "23P01";

// Detects an exclusion-constraint violation for the given constraint name,
// across every shape it can arrive in: node-postgres (local `netlify dev`)
// and Neon HTTP (production) expose `.code` and `.constraint` differently,
// and Drizzle may wrap the driver error in `.cause`. We walk the cause chain
// and also fall back to the message text.
export const isExclusionViolation = (e: unknown, constraintName: string): boolean => {
	let current: unknown = e;
	let sawExclusionCode = false;
	for (let depth = 0; depth < 6 && current != null; depth++) {
		const err = current as {
			code?: unknown;
			constraint?: unknown;
			cause?: unknown;
		};
		if (err.code === EXCLUSION_VIOLATION) sawExclusionCode = true;
		if (err.constraint === constraintName) return true;
		current = err.cause;
	}
	// Named match takes priority (handles the multiple-EXCLUDE-constraint case
	// correctly); the code-only fallback below is scoped to callers that only
	// ever insert/update one table, so it can't cross-match another table's
	// constraint in practice.
	const message = e instanceof Error ? e.message : String(e);
	if (message.includes(constraintName)) return true;
	return sawExclusionCode && /exclusion constraint/i.test(message);
};
