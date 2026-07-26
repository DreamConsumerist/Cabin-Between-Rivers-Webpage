-- Reject any two manual_blocks rows whose [check_in, check_out) ranges
-- overlap, so an admin can't stack duplicate/overlapping blocks by mistake —
-- same GiST exclusion approach as price_overrides_no_overlap and
-- reservations_no_overlap.
ALTER TABLE "manual_blocks"
	ADD CONSTRAINT "manual_blocks_no_overlap"
	EXCLUDE USING gist (daterange("check_in", "check_out", '[)') WITH &&);
