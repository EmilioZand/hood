CREATE TYPE "public"."award_source" AS ENUM('michelin', 'james_beard');--> statement-breakpoint
CREATE TYPE "public"."james_beard_status" AS ENUM('none', 'semifinalist', 'finalist', 'winner');--> statement-breakpoint
CREATE TYPE "public"."match_source" AS ENUM('google', 'yelp');--> statement-breakpoint
CREATE TYPE "public"."michelin_status" AS ENUM('none', 'bib_gourmand', 'one_star', 'two_star', 'three_star', 'selected');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."restaurant_status" AS ENUM('active', 'permanently_closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
-- NOTE: "auth"."users" already exists (managed by Supabase Auth / GoTrue).
-- It is declared in src/db/schema.ts only so Drizzle can type the profiles.id FK;
-- drizzle-kit generate still emits a CREATE TABLE for it, which is deliberately
-- stripped from this migration since running it would fail (or shadow) the real table.
CREATE TABLE "award_scrape_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid,
	"source" "award_source" NOT NULL,
	"scraped_name" text NOT NULL,
	"scraped_city" text,
	"scraped_award_text" text NOT NULL,
	"scraped_url" text NOT NULL,
	"match_confidence" numeric(4, 3),
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "award_scrape_candidates_source_scraped_url_unique" UNIQUE("source","scraped_url")
);
--> statement-breakpoint
CREATE TABLE "cuisines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "cuisines_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_awards" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"michelin_status" "michelin_status" DEFAULT 'none' NOT NULL,
	"michelin_url" text,
	"james_beard_status" "james_beard_status" DEFAULT 'none' NOT NULL,
	"james_beard_category" text,
	"james_beard_year" integer,
	"james_beard_url" text,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restaurant_busyness" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"hour" smallint NOT NULL,
	"busyness_score" smallint,
	"source" text DEFAULT 'besttime' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_busyness_restaurant_id_day_of_week_hour_unique" UNIQUE("restaurant_id","day_of_week","hour")
);
--> statement-breakpoint
CREATE TABLE "restaurant_cuisines" (
	"restaurant_id" uuid NOT NULL,
	"cuisine_id" uuid NOT NULL,
	CONSTRAINT "restaurant_cuisines_restaurant_id_cuisine_id_pk" PRIMARY KEY("restaurant_id","cuisine_id")
);
--> statement-breakpoint
CREATE TABLE "restaurant_match_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"source" "match_source" NOT NULL,
	"candidate_ext_id" text NOT NULL,
	"candidate_name" text NOT NULL,
	"candidate_address" text,
	"candidate_city" text,
	"match_score" numeric(4, 3),
	"rank" integer,
	"raw_payload" jsonb,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "restaurant_match_candidates_restaurant_id_source_candidate_ext_id_unique" UNIQUE("restaurant_id","source","candidate_ext_id")
);
--> statement-breakpoint
CREATE TABLE "restaurant_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restaurant_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"neighborhood" text,
	"cuisine_text" text,
	"notes" text,
	"suggested_by" uuid,
	"possible_duplicate_of" uuid,
	"status" "recommendation_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"resulting_restaurant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_visits" (
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"first_visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_visits_restaurant_id_user_id_pk" PRIMARY KEY("restaurant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"neighborhood" text,
	"city" text NOT NULL,
	"address" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"priority" "priority" DEFAULT 'none' NOT NULL,
	"is_high_priority" boolean DEFAULT false NOT NULL,
	"is_walk_in" boolean,
	"mention_count" integer DEFAULT 0,
	"legacy_award_note" text,
	"status" "restaurant_status" DEFAULT 'active' NOT NULL,
	"closed_detected_at" timestamp with time zone,
	"closure_suppressed" boolean DEFAULT false NOT NULL,
	"google_place_id" text,
	"google_rating" numeric(2, 1),
	"google_rating_count" integer,
	"google_business_status" text,
	"google_last_synced_at" timestamp with time zone,
	"yelp_business_id" text,
	"yelp_rating" numeric(2, 1),
	"yelp_review_count" integer,
	"yelp_last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_google_place_id_unique" UNIQUE("google_place_id"),
	CONSTRAINT "restaurants_yelp_business_id_unique" UNIQUE("yelp_business_id")
);
--> statement-breakpoint
ALTER TABLE "award_scrape_candidates" ADD CONSTRAINT "award_scrape_candidates_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_scrape_candidates" ADD CONSTRAINT "award_scrape_candidates_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_awards" ADD CONSTRAINT "restaurant_awards_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_awards" ADD CONSTRAINT "restaurant_awards_confirmed_by_profiles_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_busyness" ADD CONSTRAINT "restaurant_busyness_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_cuisines" ADD CONSTRAINT "restaurant_cuisines_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_cuisines" ADD CONSTRAINT "restaurant_cuisines_cuisine_id_cuisines_id_fk" FOREIGN KEY ("cuisine_id") REFERENCES "public"."cuisines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_match_candidates" ADD CONSTRAINT "restaurant_match_candidates_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_match_candidates" ADD CONSTRAINT "restaurant_match_candidates_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_notes" ADD CONSTRAINT "restaurant_notes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_notes" ADD CONSTRAINT "restaurant_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_recommendations" ADD CONSTRAINT "restaurant_recommendations_suggested_by_profiles_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_recommendations" ADD CONSTRAINT "restaurant_recommendations_possible_duplicate_of_restaurants_id_fk" FOREIGN KEY ("possible_duplicate_of") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_recommendations" ADD CONSTRAINT "restaurant_recommendations_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_recommendations" ADD CONSTRAINT "restaurant_recommendations_resulting_restaurant_id_restaurants_id_fk" FOREIGN KEY ("resulting_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_visits" ADD CONSTRAINT "restaurant_visits_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_visits" ADD CONSTRAINT "restaurant_visits_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;