-- Repartition price_overrides' no-overlap protection by configuration: two
-- different configurations (e.g. "Whole Cabin" vs "Downstairs Only") can now
-- each have their own seasonal override for the same date range, while two
-- overrides for the SAME configuration still can't overlap. Mixing a scalar
-- `WITH =` into a GiST index (unlike reservations_no_overlap/
-- manual_blocks_no_overlap, which stay range-only and configuration-agnostic
-- on purpose — see bookingConfigurations in db/schema.ts) requires
-- btree_gist, not previously needed in this schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Add the new constraint before dropping the old one, so there's never a
-- window with zero overlap protection on this table.
ALTER TABLE "price_overrides"
	ADD CONSTRAINT "price_overrides_no_overlap_per_configuration"
	EXCLUDE USING gist ("configuration_id" WITH =, daterange("check_in", "check_out", '[)') WITH &&);
--> statement-breakpoint

ALTER TABLE "price_overrides" DROP CONSTRAINT "price_overrides_no_overlap";
