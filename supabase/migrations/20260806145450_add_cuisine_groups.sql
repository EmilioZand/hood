CREATE TABLE "cuisine_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "cuisine_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "cuisines" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "cuisines" ADD CONSTRAINT "cuisines_group_id_cuisine_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."cuisine_groups"("id") ON DELETE set null ON UPDATE no action;