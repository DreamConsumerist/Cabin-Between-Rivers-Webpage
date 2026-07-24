CREATE TABLE "double_booking_conflicts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "double_booking_conflicts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" varchar(20) NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"detail" text NOT NULL,
	"reservation_id" integer,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "double_booking_conflicts_resolved_at_idx" ON "double_booking_conflicts" ("resolved_at");--> statement-breakpoint
ALTER TABLE "double_booking_conflicts" ADD CONSTRAINT "double_booking_conflicts_reservation_id_reservations_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id");