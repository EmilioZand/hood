import {
  pgSchema,
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  smallint,
  timestamp,
  jsonb,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { OpeningPeriod } from "@/lib/integrations/googlePlaces";

type GoogleOpeningHours = { periods: OpeningPeriod[] } | null;

// Supabase-managed auth schema — referenced for FK typing only, never migrated by us.
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const priorityEnum = pgEnum("priority", ["none", "low", "medium", "high"]);
export const restaurantStatusEnum = pgEnum("restaurant_status", [
  "active",
  "permanently_closed",
  "archived",
]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "confirmed", "rejected"]);
export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "pending",
  "approved",
  "rejected",
]);
export const matchSourceEnum = pgEnum("match_source", ["google", "yelp"]);
export const awardSourceEnum = pgEnum("award_source", ["michelin", "james_beard"]);
export const michelinStatusEnum = pgEnum("michelin_status", [
  "none",
  "bib_gourmand",
  "one_star",
  "two_star",
  "three_star",
  "selected",
]);
export const jamesBeardStatusEnum = pgEnum("james_beard_status", [
  "none",
  "semifinalist",
  "finalist",
  "winner",
]);

// 1:1 with auth.users — app-level profile data BetterAuth would have owned; now Supabase Auth.
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  // Where they live, not a restaurant's location — same city + city-scoped neighborhood
  // pattern restaurants already use, both optional (existing users won't have one set).
  city: text("city"),
  neighborhoodId: uuid("neighborhood_id").references(() => neighborhoods.id),
  isAdmin: boolean("is_admin").notNull().default(false),
  // New accounts start unapproved — only flipped to true by redeeming a valid invite
  // (see `invites` below). Existing rows are backfilled to true by migration.
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Invite-only signup: a link (`/signup?invite=<token>`) an admin generates and shares.
// Optionally scoped to one email address; otherwise anyone with the link can redeem it,
// once, before it's used/revoked/expired.
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  email: text("email"),
  createdBy: uuid("created_by").references(() => profiles.id),
  usedBy: uuid("used_by").references(() => profiles.id),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Broad category ("Asian", "Latin American"...) that free-text cuisine tags roll up
// into for search — lets a query like "asian" match a restaurant tagged "Japanese"
// even though that word never appears in the tag itself. Assigned by keyword-matching
// in lib/data/cuisineGroups.ts, not user-editable.
export const cuisineGroups = pgTable("cuisine_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});

export const cuisines = pgTable("cuisines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  // Nullable: plenty of tags (venue/format words like "Bar", "Steak") have no single
  // national origin and are deliberately left ungrouped rather than guessed at.
  groupId: uuid("group_id").references(() => cuisineGroups.id, { onDelete: "set null" }),
});

// Scoped to a single city (not a global lookup) — the same neighborhood name can exist
// as separate rows under different cities (e.g. "Napa Valley" is a real, distinct label
// under both "Napa" and "Calistoga"), so the pair is what's canonical, not the name alone.
export const neighborhoods = pgTable(
  "neighborhoods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.name, t.city)],
);

// A restaurant is one shared identity (name, cuisine, notes, visited status, priority,
// awards) that can have multiple physical locations (see restaurantLocations) — e.g.
// "Fiorella" has 3 SF locations, all sharing one set of notes/visited-by/priority, but
// each with its own address, coordinates, ratings, and closure status.
export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  neighborhoodId: uuid("neighborhood_id").references(() => neighborhoods.id),
  city: text("city").notNull(),
  priority: priorityEnum("priority").notNull().default("none"),
  isHighPriority: boolean("is_high_priority").notNull().default(false),
  isWalkIn: boolean("is_walk_in"),
  mentionCount: integer("mention_count").default(0),
  legacyAwardNote: text("legacy_award_note"),
  // Unattributed "Been There: Yes/No" from the source spreadsheet — distinct from
  // restaurantVisits, which tracks visits per named user going forward.
  legacyBeenThere: boolean("legacy_been_there").notNull().default(false),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.name, t.city)]);

export const restaurantLocations = pgTable("restaurant_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  address: text("address"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  status: restaurantStatusEnum("status").notNull().default("active"),
  closedDetectedAt: timestamp("closed_detected_at", { withTimezone: true }),
  closureSuppressed: boolean("closure_suppressed").notNull().default(false),
  googlePlaceId: text("google_place_id").unique(),
  googleRating: numeric("google_rating", { precision: 2, scale: 1 }),
  googleRatingCount: integer("google_rating_count"),
  googleBusinessStatus: text("google_business_status"),
  // Weekly period schedule (Google's regularOpeningHours.periods) — not a live snapshot,
  // so "open now" can be computed client-side against the viewer's current time.
  googleOpeningHours: jsonb("google_opening_hours").$type<GoogleOpeningHours>(),
  googleLastSyncedAt: timestamp("google_last_synced_at", { withTimezone: true }),
  yelpBusinessId: text("yelp_business_id").unique(),
  yelpUrl: text("yelp_url"),
  yelpRating: numeric("yelp_rating", { precision: 2, scale: 1 }),
  yelpReviewCount: integer("yelp_review_count"),
  yelpLastSyncedAt: timestamp("yelp_last_synced_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const restaurantCuisines = pgTable(
  "restaurant_cuisines",
  {
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    cuisineId: uuid("cuisine_id")
      .notNull()
      .references(() => cuisines.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.cuisineId] })],
);

export const restaurantVisits = pgTable(
  "restaurant_visits",
  {
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.userId] })],
);

// One rating (1-5) per user per restaurant — rating again just overwrites the row
// (upsert), it isn't a history of past ratings.
export const restaurantRatings = pgTable(
  "restaurant_ratings",
  {
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.userId] })],
);

export const restaurantNotes = pgTable("restaurant_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => profiles.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const restaurantAwards = pgTable("restaurant_awards", {
  restaurantId: uuid("restaurant_id")
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  michelinStatus: michelinStatusEnum("michelin_status").notNull().default("none"),
  michelinUrl: text("michelin_url"),
  jamesBeardStatus: jamesBeardStatusEnum("james_beard_status").notNull().default("none"),
  jamesBeardCategory: text("james_beard_category"),
  jamesBeardYear: integer("james_beard_year"),
  jamesBeardUrl: text("james_beard_url"),
  confirmedBy: uuid("confirmed_by").references(() => profiles.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const awardScrapeCandidates = pgTable(
  "award_scrape_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
    source: awardSourceEnum("source").notNull(),
    scrapedName: text("scraped_name").notNull(),
    scrapedCity: text("scraped_city"),
    scrapedAwardText: text("scraped_award_text").notNull(),
    scrapedUrl: text("scraped_url").notNull(),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }),
    status: reviewStatusEnum("status").notNull().default("pending"),
    rawPayload: jsonb("raw_payload"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  // Michelin (one guide page per restaurant) would dedupe fine on (source, scrapedUrl)
  // alone, but James Beard publishes every category on one shared story-page URL, so
  // scrapedAwardText (the category) has to be part of the key too — and since
  // semifinalist/finalist categories can list many different restaurants (unlike
  // winners, one per category), restaurantId must be part of the key as well, or
  // multiple distinct matches under the same category silently overwrite each other.
  (t) => [unique().on(t.source, t.scrapedUrl, t.scrapedAwardText, t.restaurantId)],
);

export const restaurantMatchCandidates = pgTable(
  "restaurant_match_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    source: matchSourceEnum("source").notNull(),
    candidateExtId: text("candidate_ext_id").notNull(),
    candidateName: text("candidate_name").notNull(),
    candidateAddress: text("candidate_address"),
    candidateCity: text("candidate_city"),
    matchScore: numeric("match_score", { precision: 4, scale: 3 }),
    rank: integer("rank"),
    rawPayload: jsonb("raw_payload"),
    status: reviewStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.restaurantId, t.source, t.candidateExtId)],
);

export const restaurantBusyness = pgTable(
  "restaurant_busyness",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    hour: smallint("hour").notNull(),
    busynessScore: smallint("busyness_score"),
    source: text("source").notNull().default("besttime"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.restaurantId, t.dayOfWeek, t.hour)],
);

export const restaurantRecommendations = pgTable("restaurant_recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  city: text("city"),
  neighborhood: text("neighborhood"),
  cuisineText: text("cuisine_text"),
  notes: text("notes"),
  isHighPriority: boolean("is_high_priority").notNull().default(false),
  alreadyVisited: boolean("already_visited").notNull().default(false),
  suggestedBy: uuid("suggested_by").references(() => profiles.id),
  // Unlike every other restaurant_* table (which cascades — they're detail records with
  // no meaning outside their parent), this row is a submission log: it should survive the
  // referenced restaurant being deleted, just with the now-dangling pointer cleared.
  possibleDuplicateOf: uuid("possible_duplicate_of").references(() => restaurants.id, { onDelete: "set null" }),
  status: recommendationStatusEnum("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => profiles.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  resultingRestaurantId: uuid("resulting_restaurant_id").references(() => restaurants.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const restaurantsRelations = relations(restaurants, ({ many, one }) => ({
  locations: many(restaurantLocations),
  cuisines: many(restaurantCuisines),
  visits: many(restaurantVisits),
  ratings: many(restaurantRatings),
  notes: many(restaurantNotes),
  neighborhood: one(neighborhoods, {
    fields: [restaurants.neighborhoodId],
    references: [neighborhoods.id],
  }),
  award: one(restaurantAwards, {
    fields: [restaurants.id],
    references: [restaurantAwards.restaurantId],
  }),
  createdByProfile: one(profiles, {
    fields: [restaurants.createdBy],
    references: [profiles.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  neighborhood: one(neighborhoods, {
    fields: [profiles.neighborhoodId],
    references: [neighborhoods.id],
  }),
}));

export const restaurantLocationsRelations = relations(restaurantLocations, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantLocations.restaurantId],
    references: [restaurants.id],
  }),
}));

export const cuisineGroupsRelations = relations(cuisineGroups, ({ many }) => ({
  cuisines: many(cuisines),
}));

export const cuisinesRelations = relations(cuisines, ({ one }) => ({
  group: one(cuisineGroups, {
    fields: [cuisines.groupId],
    references: [cuisineGroups.id],
  }),
}));

export const restaurantCuisinesRelations = relations(restaurantCuisines, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantCuisines.restaurantId],
    references: [restaurants.id],
  }),
  cuisine: one(cuisines, {
    fields: [restaurantCuisines.cuisineId],
    references: [cuisines.id],
  }),
}));

export const restaurantVisitsRelations = relations(restaurantVisits, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantVisits.restaurantId],
    references: [restaurants.id],
  }),
  user: one(profiles, {
    fields: [restaurantVisits.userId],
    references: [profiles.id],
  }),
}));

export const restaurantRatingsRelations = relations(restaurantRatings, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantRatings.restaurantId],
    references: [restaurants.id],
  }),
  user: one(profiles, {
    fields: [restaurantRatings.userId],
    references: [profiles.id],
  }),
}));

export const restaurantNotesRelations = relations(restaurantNotes, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantNotes.restaurantId],
    references: [restaurants.id],
  }),
  author: one(profiles, {
    fields: [restaurantNotes.authorId],
    references: [profiles.id],
  }),
}));
