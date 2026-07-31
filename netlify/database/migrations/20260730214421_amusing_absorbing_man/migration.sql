CREATE TABLE "discount_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discount_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(50) NOT NULL,
	"discount_type" varchar(10) NOT NULL,
	"discount_value" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "discount_code_id" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "discount_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_code_idx" ON "discount_codes" ("code");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_discount_code_id_discount_codes_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id");