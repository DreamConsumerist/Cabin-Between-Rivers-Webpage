CREATE TABLE "booking_configurations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_configurations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"nightly_rate" integer DEFAULT 0 NOT NULL,
	"cleaning_fee" integer DEFAULT 0 NOT NULL,
	"min_nights" integer DEFAULT 1 NOT NULL,
	"base_occupancy" integer DEFAULT 4 NOT NULL,
	"extra_guest_fee" integer DEFAULT 2500 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_overrides" ADD COLUMN "configuration_id" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "configuration_id" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "configuration_switching_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "price_overrides" ADD CONSTRAINT "price_overrides_configuration_id_booking_configurations_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "booking_configurations"("id");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_configuration_id_booking_configurations_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "booking_configurations"("id");