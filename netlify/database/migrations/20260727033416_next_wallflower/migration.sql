ALTER TABLE "price_overrides" ADD COLUMN "recurring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "price_overrides" ADD COLUMN "series_parent_id" integer;--> statement-breakpoint
ALTER TABLE "price_overrides" ADD CONSTRAINT "price_overrides_series_parent_id_price_overrides_id_fkey" FOREIGN KEY ("series_parent_id") REFERENCES "price_overrides"("id");