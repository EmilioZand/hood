# Hood

> What's good in the hood?

A small, invite-only web app for tracking Bay Area restaurants worth trying. It replaces a
manually maintained spreadsheet of ~320 spots with something that keeps itself current:
ratings, addresses, and closures are refreshed from Google and Yelp automatically, while the
things no API can tell you (notes, who has been, what to prioritize) stay collaborative.

Live at [hoodrecs.com](https://hoodrecs.com).

Browsing is public. Everything that writes (notes, ratings, marking visited, adding a spot,
all admin tooling) requires an account, and accounts are invite-only.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16, App Router, React Server Components + Server Actions |
| Database | Postgres via Supabase, accessed with Drizzle ORM |
| Auth | Supabase Auth (email/password + Google OAuth) |
| File storage | Supabase Storage (user avatars) |
| Maps | Mapbox GL JS |
| Enrichment | Google Places API (New), Yelp Fusion, BestTime |
| Hosting | Vercel, with Vercel Cron for scheduled jobs |
| Tests | Vitest |

## Getting started

You need Node 20+, npm, and Docker running (the local Supabase stack runs in containers).

```bash
git clone https://github.com/EmilioZand/hood.git
cd hood
npm install
```

Start the local Supabase stack. This boots Postgres, Auth, and Storage, and prints the local
URLs and keys you need for the next step:

```bash
npm run supabase:start
```

Copy the env template and fill it in:

```bash
cp .env.example .env.local
```

At minimum you need `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (all four come from the
`supabase:start` output) plus `NEXT_PUBLIC_MAPBOX_TOKEN` if you want the map to render. Every
external integration is gated on its own key being present, so you can leave
`GOOGLE_PLACES_API_KEY`, `YELP_FUSION_API_KEY`, and `BESTTIME_API_KEY` empty and the app
still runs. Google and Yelp lookups just quietly no-op.

Apply migrations and start the dev server:

```bash
npx supabase migration up --local
npm run dev
```

Then open http://localhost:3000.

Signup is invite-only, so to get a first account you either need to generate an invite from
`/admin/invites` (which needs an admin, chicken and egg) or seed one directly. The
`scripts/seed-*.ts` files show the pattern: create the auth user through the Supabase Admin
API, then flip `is_admin` and `is_approved` on its `profiles` row.

## Scripts

```bash
npm run dev                  # dev server
npm run build                # production build
npm test                     # Vitest, single run
npm run test:watch           # Vitest, watch mode
npm run lint                 # ESLint

npm run supabase:start       # start the local Supabase stack
npm run supabase:stop        # stop it
npm run supabase:reset       # drop and re-apply all migrations (destructive)

npm run db:generate          # generate a migration from schema changes
npm run db:studio            # Drizzle Studio, browse the DB
```

One-off maintenance scripts live in `scripts/` and run via `tsx`:

```bash
npm run import:excel         # seed restaurants from the source spreadsheet (idempotent)
npm run match:onboard        # queue Google/Yelp match candidates for unmatched spots
npm run match:auto-confirm   # auto-confirm unambiguous high-confidence matches
npm run sync:ratings         # run the ratings sync by hand
```

## How it works

### Restaurants and locations

A `restaurants` row is one identity: its name, cuisines, notes, ratings, and priority. A
chain's individual branches are separate `restaurant_locations` rows hanging off it, each
with its own address, coordinates, ratings, hours, and closure status. So "Fiorella" is one
spot with three locations, not three spots. A DB-level `unique(name, city)` on `restaurants`
enforces that.

### Matching against Google and Yelp

External data is never written directly. A search puts its top few results into
`restaurant_match_candidates` as `pending`, and an admin confirms or rejects them at
`/admin/matches`. Confirming is what actually writes an address, coordinates, and ratings
onto a location.

The exception is confidence: a candidate scoring at or above `GOOGLE_AUTO_CONFIRM_THRESHOLD`
(0.8) *and* decisively ahead of the runner-up gets applied without review. Scoring lives in
`src/lib/matching/fuzzyMatch.ts` (trigram similarity plus an overlap coefficient, adjusted by
whether the city matches) and is the most heavily tested code in the repo.

### Adding a spot

`/add-entry` is a two-step flow. Step one takes just a name and city and checks Google; if it
finds a confident match, step two opens with neighborhood and cuisine prefilled and editable.
It also blocks on near-duplicates, with a "create anyway" override for genuinely distinct
spots that happen to have similar names.

### Cuisines

Cuisine tags are free text (`Japanese`, `Ramen`, `Natural Wine Bar`) and get classified into
broad `cuisine_groups` (Asian, European, Latin American, and so on) by keyword, so searching
"asian" finds a spot tagged only "Japanese". Classification is in
`src/lib/data/cuisineGroups.ts`; `scripts/backfill-cuisine-groups.ts` reclassifies everything
after you edit the keyword lists.

### Closures

The weekly ratings sync reads Google's `businessStatus` and flips a location to
`permanently_closed` when Google says so, recording `closedDetectedAt`. Closed spots are
never deleted or hidden silently, just badged. Admins can also mark a location closed by
hand. `closureSuppressed` exists as an override for Google false positives but is not yet
wired to any UI (see [TODO.md](TODO.md)).

### Awards

Michelin and James Beard have no public API, so awards come from a best-effort scraper into
`award_scrape_candidates` and must be confirmed by a human at `/admin/awards` before they
count. Scraped data is never treated as authoritative on its own, and manual entry is always
available as a fallback.

### Scheduled jobs

Declared in `vercel.json`, both weekly, both gated on a `CRON_SECRET` bearer token:

| Route | Schedule | Does |
| --- | --- | --- |
| `/api/cron/sync-ratings` | Mondays 06:00 UTC | Refresh Google + Yelp ratings, hours, closures |
| `/api/cron/scrape-awards` | Mondays 07:00 UTC | Scrape Michelin + James Beard into the review queue |

## Authorization

Worth understanding before you touch anything server-side.

Drizzle connects to Postgres directly as the `postgres` role, which means **Postgres RLS
policies do not apply to the app's own queries**. RLS is enabled on most tables as
defense-in-depth, but it is not the gate.

The real gate is `requireUser()` / `requireAdmin()` in `src/lib/auth/guards.ts`, called
inside every server action and route handler that writes. `src/proxy.ts` (middleware) also
redirects signed-out visitors away from protected paths, but that is a UX convenience only:
it does not protect a hand-crafted POST. Use `getOptionalUser()` for read-only pages that
should render for anonymous visitors.

`src/lib/auth/guards.test.ts` asserts that every exported server action calls a guard. It is
a static source check with known blind spots, documented in [TODO.md](TODO.md).

## Layout

```
src/
  app/                  routes, pages, and server actions
    admin/              match review, award review, invites, users
    api/cron/           scheduled jobs
    restaurants/[id]/   spot detail and edit
    users/[id]/         profiles
  components/           shared UI (map, comboboxes, avatar)
  db/                   Drizzle schema and client
  lib/
    auth/               guards, the authorization gate
    data/               data access and domain logic
    integrations/       Google Places, Yelp, BestTime, scrapers
    matching/           fuzzy matching and scoring
    sync/               the ratings sync job
  proxy.ts              middleware
scripts/                one-off maintenance scripts
supabase/migrations/    schema migrations
```

Tests sit next to what they test as `*.test.ts`.

## Contributing notes

- `AGENTS.md` has instructions for AI coding agents working in this repo. Worth a read
  regardless, since it flags that this is Next.js 16 and its APIs differ from older versions.
- [TODO.md](TODO.md) is the backlog, from a security, functional-gaps, and refactor audit. It
  records what was confirmed versus what still needs a runtime check, and which findings
  turned out to be non-issues, so nothing gets re-investigated.
- Migrations are generated, not hand-written: change `src/db/schema.ts`, run
  `npm run db:generate`, then apply with `npx supabase migration up --local`. Hand-write SQL
  only for things Drizzle does not model, like RLS policies and storage buckets.
- Before pushing: `npx tsc --noEmit`, `npm run lint`, `npm test`.
