-- Backfill: create the default booking configuration from the existing
-- settings row's pricing (settings still holds these columns for now — see
-- the next migration), then point every existing reservation/price_override
-- at it. Every pre-existing row unambiguously belongs to this one
-- configuration, since configurations didn't exist before this migration.
INSERT INTO "booking_configurations"
	("name", "nightly_rate", "cleaning_fee", "min_nights", "base_occupancy", "extra_guest_fee", "is_default", "position")
SELECT
	'Whole Cabin',
	"nightly_rate",
	"cleaning_fee",
	"min_nights",
	"base_occupancy",
	"extra_guest_fee",
	true,
	0
FROM "settings"
ORDER BY "id"
LIMIT 1;

-- settings may not have a row yet in a fresh environment (lazily created —
-- see lib/availability.ts's getSettings) — fall back to the column defaults
-- in that case so the default configuration always exists.
INSERT INTO "booking_configurations" ("name", "is_default", "position")
SELECT 'Whole Cabin', true, 0
WHERE NOT EXISTS (SELECT 1 FROM "booking_configurations");
--> statement-breakpoint

UPDATE "reservations"
SET "configuration_id" = (SELECT "id" FROM "booking_configurations" WHERE "is_default" LIMIT 1)
WHERE "configuration_id" IS NULL;
--> statement-breakpoint

UPDATE "price_overrides"
SET "configuration_id" = (SELECT "id" FROM "booking_configurations" WHERE "is_default" LIMIT 1)
WHERE "configuration_id" IS NULL;
