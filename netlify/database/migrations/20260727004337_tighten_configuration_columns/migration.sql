ALTER TABLE "settings" DROP COLUMN "nightly_rate";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "cleaning_fee";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "min_nights";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "base_occupancy";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "extra_guest_fee";--> statement-breakpoint
ALTER TABLE "price_overrides" ALTER COLUMN "configuration_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "configuration_id" SET NOT NULL;