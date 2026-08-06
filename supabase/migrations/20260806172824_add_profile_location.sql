ALTER TABLE "profiles" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "neighborhood_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE no action ON UPDATE no action;