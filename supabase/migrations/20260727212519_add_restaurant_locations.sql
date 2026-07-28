CREATE TABLE "restaurant_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"address" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"status" "restaurant_status" DEFAULT 'active' NOT NULL,
	"closed_detected_at" timestamp with time zone,
	"closure_suppressed" boolean DEFAULT false NOT NULL,
	"google_place_id" text,
	"google_rating" numeric(2, 1),
	"google_rating_count" integer,
	"google_business_status" text,
	"google_opening_hours" jsonb,
	"google_last_synced_at" timestamp with time zone,
	"yelp_business_id" text,
	"yelp_url" text,
	"yelp_rating" numeric(2, 1),
	"yelp_review_count" integer,
	"yelp_last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_locations_google_place_id_unique" UNIQUE("google_place_id"),
	CONSTRAINT "restaurant_locations_yelp_business_id_unique" UNIQUE("yelp_business_id")
);
--> statement-breakpoint
ALTER TABLE "restaurants" DROP CONSTRAINT "restaurants_google_place_id_unique";--> statement-breakpoint
ALTER TABLE "restaurants" DROP CONSTRAINT "restaurants_yelp_business_id_unique";--> statement-breakpoint
ALTER TABLE "restaurant_locations" ADD CONSTRAINT "restaurant_locations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "restaurant_locations" (
	"restaurant_id", "address", "latitude", "longitude", "status", "closed_detected_at",
	"closure_suppressed", "google_place_id", "google_rating", "google_rating_count",
	"google_business_status", "google_opening_hours", "google_last_synced_at",
	"yelp_business_id", "yelp_url", "yelp_rating", "yelp_review_count",
	"yelp_last_synced_at", "last_sync_error", "created_at", "updated_at"
)
SELECT
	"id", "address", "latitude", "longitude", "status", "closed_detected_at",
	"closure_suppressed", "google_place_id", "google_rating", "google_rating_count",
	"google_business_status", "google_opening_hours", "google_last_synced_at",
	"yelp_business_id", "yelp_url", "yelp_rating", "yelp_review_count",
	"yelp_last_synced_at", "last_sync_error", "created_at", "updated_at"
FROM "restaurants"
WHERE "address" IS NOT NULL OR "google_place_id" IS NOT NULL OR "yelp_business_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "latitude";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "longitude";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "closed_detected_at";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "closure_suppressed";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "google_place_id";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "google_rating";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "google_rating_count";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "google_business_status";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "google_opening_hours";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "google_last_synced_at";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "yelp_business_id";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "yelp_url";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "yelp_rating";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "yelp_review_count";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "yelp_last_synced_at";--> statement-breakpoint
ALTER TABLE "restaurants" DROP COLUMN "last_sync_error";