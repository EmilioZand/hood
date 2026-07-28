CREATE TABLE "neighborhoods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "neighborhoods_name_city_unique" UNIQUE("name","city")
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "neighborhood_id" uuid;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "neighborhoods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "neighborhoods_select_authenticated" ON "neighborhoods"
  FOR SELECT TO authenticated USING (true);--> statement-breakpoint
CREATE POLICY "neighborhoods_write_admin" ON "neighborhoods"
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());--> statement-breakpoint

-- Backfill: one neighborhoods row per distinct (city, neighborhood) pair already in use.
INSERT INTO "neighborhoods" ("name", "city")
SELECT DISTINCT "neighborhood", "city" FROM "restaurants" WHERE "neighborhood" IS NOT NULL
ON CONFLICT ("name", "city") DO NOTHING;--> statement-breakpoint

UPDATE "restaurants" r
SET "neighborhood_id" = n."id"
FROM "neighborhoods" n
WHERE r."neighborhood" = n."name" AND r."city" = n."city";--> statement-breakpoint

ALTER TABLE "restaurants" DROP COLUMN "neighborhood";