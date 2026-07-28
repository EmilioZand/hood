CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"created_by" uuid,
	"used_by" uuid,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
-- Existing accounts predate the invite system and are already trusted — backfill them
-- to approved, then flip the column default to false so only new signups start blocked.
ALTER TABLE "profiles" ADD COLUMN "is_approved" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "is_approved" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_profiles_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invites_admin_only" ON "invites"
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());