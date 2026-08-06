ALTER TABLE "restaurant_recommendations" DROP CONSTRAINT "restaurant_recommendations_possible_duplicate_of_restaurants_id_fk";
--> statement-breakpoint
ALTER TABLE "restaurant_recommendations" DROP CONSTRAINT "restaurant_recommendations_resulting_restaurant_id_restaurants_id_fk";
--> statement-breakpoint
ALTER TABLE "restaurant_recommendations" ADD CONSTRAINT "restaurant_recommendations_possible_duplicate_of_restaurants_id_fk" FOREIGN KEY ("possible_duplicate_of") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_recommendations" ADD CONSTRAINT "restaurant_recommendations_resulting_restaurant_id_restaurants_id_fk" FOREIGN KEY ("resulting_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;