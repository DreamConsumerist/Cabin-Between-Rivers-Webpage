ALTER TABLE "settings" ADD COLUMN "base_occupancy" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "extra_guest_fee" integer DEFAULT 2500 NOT NULL;