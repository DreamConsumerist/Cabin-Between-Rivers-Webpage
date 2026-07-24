-- Reject any two price_overrides rows whose [check_in, check_out) ranges
-- overlap, so at most one override ever covers a given night. No WHERE clause
-- needed here (unlike reservations_no_overlap) — there's no status column;
-- every row is an active override. Same GiST exclusion approach, see that
-- migration for the underlying mechanism.
ALTER TABLE "price_overrides"
	ADD CONSTRAINT "price_overrides_no_overlap"
	EXCLUDE USING gist (daterange("check_in", "check_out", '[)') WITH &&);
