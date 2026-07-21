CREATE TABLE "external_blocks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "external_blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" varchar(20) NOT NULL,
	"uid" varchar(512) NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhook_events" (
	"event_id" varchar(255) PRIMARY KEY,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reservations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"guest_name" varchar(255) NOT NULL,
	"guest_email" varchar(255) NOT NULL,
	"guest_phone" varchar(50),
	"guests" integer DEFAULT 1 NOT NULL,
	"amount_total" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"stripe_payment_intent_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nightly_rate" integer DEFAULT 0 NOT NULL,
	"cleaning_fee" integer DEFAULT 0 NOT NULL,
	"min_nights" integer DEFAULT 1 NOT NULL,
	"airbnb_ical_url" text,
	"vrbo_ical_url" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "external_blocks_source_uid_idx" ON "external_blocks" ("source","uid");