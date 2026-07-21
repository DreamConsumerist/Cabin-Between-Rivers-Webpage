-- Prevent overlapping same-site bookings at the database level.
-- Reject any two ACTIVE (pending OR confirmed) reservations whose
-- [check_in, check_out) date ranges overlap. '[)' = check-out day is free for a
-- same-day check-in. The WHERE scopes the constraint to active rows, so expired/
-- cancelled bookings don't block. create-booking relies on this: two concurrent
-- overlapping inserts cannot both succeed, so no read-then-write race double-books.
--
-- Range-only exclusion uses Postgres's built-in GiST range operators, so no
-- btree_gist extension is required (that's only needed to mix a scalar `WITH =`
-- into the same index).
ALTER TABLE "reservations"
	ADD CONSTRAINT "reservations_no_overlap"
	EXCLUDE USING gist (daterange("check_in", "check_out", '[)') WITH &&)
	WHERE ("status" IN ('pending', 'confirmed'));
