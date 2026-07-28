CREATE TABLE "restaurant_ratings" (
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_ratings_restaurant_id_user_id_pk" PRIMARY KEY("restaurant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "restaurant_ratings" ADD CONSTRAINT "restaurant_ratings_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_ratings" ADD CONSTRAINT "restaurant_ratings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "restaurant_ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "restaurant_ratings_select_authenticated" ON "restaurant_ratings"
  FOR SELECT TO authenticated USING (true);--> statement-breakpoint
CREATE POLICY "restaurant_ratings_insert_own" ON "restaurant_ratings"
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "restaurant_ratings_update_own" ON "restaurant_ratings"
  FOR UPDATE TO authenticated USING (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "restaurant_ratings_delete_own" ON "restaurant_ratings"
  FOR DELETE TO authenticated USING (user_id = auth.uid());