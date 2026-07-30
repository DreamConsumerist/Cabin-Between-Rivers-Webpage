ALTER TABLE "reservations" ADD COLUMN "check_in_email_id" varchar(255);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "check_out_email_id" varchar(255);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "check_in_instructions" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "check_out_instructions" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "check_in_reminder_hour" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "check_out_reminder_hour" integer;