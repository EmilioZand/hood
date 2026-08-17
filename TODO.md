# TODO / Backlog

Findings from a three-part codebase audit (security, functional gaps, refactors) run
2026-08-17 at commit `9247b2d`. Each item notes whether it was **confirmed by reading the
code** or is **suspected and still needs a runtime check**, so nothing here has to be
re-derived from scratch.

Ordered roughly by value-to-effort. File references are `path:line` as of `0df4417` — they
drift, so grep the named symbol if a line number looks off.

---

## Already fixed (don't redo)

- **Open redirect in post-auth redirect** — fixed in `0df4417`. Added
  `src/lib/http/safeRedirect.ts` (`safeRedirectPath`) and applied it at all three sinks:
  password sign-in, OAuth callback, and the detail page's `back` param. Deleted the old
  local `isSafeRelativePath`. 11 tests in `safeRedirect.test.ts`.
- **`restaurant_recommendations` FK blocking restaurant deletes** — fixed in
  `20260806165820_fix_recommendation_delete_cascade.sql` (`set null` on both FKs). Note the
  *same class of problem still exists for user deletes* — see P1 below.

---

## P0 — do these first

### 1. A single 24-hour restaurant 500s the home page
**Confirmed.** `src/lib/data/openingHours.ts:46` does `period.close.hour * 60 + …`, but
`OpeningPeriod.close` (`src/lib/integrations/googlePlaces.ts:3-6`) is typed non-optional
while the Google Places API **omits `close` entirely** for always-open places.
`mapGooglePlace` (`googlePlaces.ts:87-89`) passes `periods` through unvalidated into
`jsonb`. So one 24-hour spot → `TypeError: Cannot read properties of undefined` → with no
`error.tsx` anywhere in `src/`, a 500 on `/` for every user whenever "Open now" is checked.
Bay Area 24-hour diners make this when-not-if.

Fix: `if (!period.close) return true;` (a period with no close means always open). Make
`close` optional in the type. Add a test — `openingHours.test.ts` has 6 cases, none without
a `close`.

### 2. `CRON_SECRET` fails open when unset
**Confirmed.** Flagged independently by two of the three audits.
`src/app/api/cron/sync-ratings/route.ts:9` and `scrape-awards/route.ts:9` compare against
`` `Bearer ${process.env.CRON_SECRET}` ``. If the env var is missing, that's the literal
string `"Bearer undefined"` and anyone sending that header is authorized. `sync-ratings`
then makes one Google Details + one Yelp Details call *per location* with `maxDuration = 300`.

Almost certainly set in prod today, so this is latent — but a preview deploy or a renamed
var activates it. Fix: fail closed if the secret is unset, and use `crypto.timingSafeEqual`.

### 3. Add an `error.tsx` (and probably `not-found.tsx`)
**Confirmed.** There is no `error.tsx`, `global-error.tsx`, or `loading.tsx` anywhere in
`src/`. Every raw `throw` in a server action becomes an opaque error page whose message
Next redacts in production — including `ForbiddenError` from `requireAdmin()` when an admin
is demoted with a tab open, and the several raw Postgres unique-violation errors listed
below. This is the cheapest single improvement to how failures feel.

---

## P1 — real bugs, worth a focused pass

### 4. `closureSuppressed` is unreachable — admins have no working override
**Confirmed.** `closeSuppressClosure` (`src/app/restaurants/actions.ts:140`) is an exported
server action with **no caller**. The flag is read in two places to hide the closure banner
(`src/app/page.tsx:338`, `src/app/restaurants/[id]/page.tsx:201`) and only ever written
`false`, so it can never become `true`.

Consequence: when Google wrongly reports a spot permanently closed, the admin's only
recourse is "Reopen" → `status: "active"`, and the next Monday `sync-ratings` reads
`businessStatus` again and flips it straight back. The override the whole closure design
depends on doesn't exist. Wire it to a UI control on the detail page.

Related latent bug in the same area: `src/lib/sync/syncRatings.ts:44-48` reopens a location
**without** clearing `closureSuppressed`, unlike `setLocationClosed`
(`restaurants/actions.ts:180`) which does. Once a UI exists, a stale suppressed flag will
survive a reopen and later hide a *genuine* closure.

### 5. "No match" silently rejects confirmed candidates, then a resync deletes them
**Confirmed.** `rejectAllForSource` (`src/app/admin/matches/actions.ts:28-36`) filters on
`restaurantId` + `source` with **no `status` filter**, so it flips already-`confirmed`
candidates to `rejected`. `resyncGoogleCandidates` (`:55-60`) then deletes
`status IN ('pending','rejected')` — destroying the confirmed candidate row and directly
contradicting its own docstring at `:44-45` ("Leaves any already-confirmed candidate
alone"). The live location survives; the provenance record is silently gone.

Fix: add `eq(restaurantMatchCandidates.status, "pending")` to the where clause.

### 6. Deleting a user is impossible
**Confirmed** by reading the migration SQL. `restaurant_notes.author_id`,
`restaurants.created_by`, `invites.created_by`, `invites.used_by`,
`restaurant_recommendations.suggested_by` / `reviewed_by`, `restaurant_awards.confirmed_by`,
and both candidate tables' `reviewed_by` are all `ON DELETE no action`
(`20260727183228_shallow_komodo.sql:159-176`, `20260728000314_add_invites_and_approval.sql:18-19`).
Meanwhile `profiles.id → auth.users.id` is `ON DELETE cascade`, so deleting the auth user
tries to cascade into `profiles` and is blocked by every one of those FKs. Any user who
ever added a spot or wrote a note cannot be removed.

The intent is unambiguous — `restaurant_notes.authorId` is nullable *and*
`restaurants/[id]/page.tsx:369-374` already renders an "Unknown" fallback for a null author.
And `restaurant_visits.user_id` / `restaurant_ratings.user_id` **are** cascade, so this was
done right twice and missed everywhere else. Migration: `set null` on the attribution
columns, `cascade` on anything meaningless without its user.

### 7. Duplicate spot creation: raw Postgres error + a partial write that locks the user out
**Confirmed.** The exact-duplicate check lives only in `startAddSpot` (step 1). Step 2
carries name/city as hidden inputs from the **URL** (`src/app/add-entry/page.tsx:140-141`)
and `submitRecommendation` never re-checks. So navigating straight to
`/add-entry?step=2&name=Zuni%20Cafe&city=San%20Francisco`, or hitting Back after a
successful submit and resubmitting, or double-clicking the button, hits
`unique(name, city)` and surfaces a raw Postgres error.

Worse: the five writes at `add-entry/actions.ts:123-160` have **no transaction**, and
`getOrCreateCuisine` (`src/lib/data/cuisines.ts:8-19`) does read-then-insert against
`unique(cuisines.name)` with no `onConflictDoNothing` — note `getOrCreateNeighborhoodId`
(`neighborhoods.ts:21-34`) handles exactly this race correctly, so the omission is an
oversight. Lose that race and the restaurant row is committed while cuisines/visit/note/log
are not; the user sees a crash and on retry hits the unique violation forever.

Fix: wrap in `db.transaction`, add `onConflictDoNothing` to `getOrCreateCuisine`, and
re-check the exact duplicate inside `submitRecommendation`.

### 8. Invite redemption is a TOCTOU race, and invites never expire
**Confirmed.** `consumeInvite` (`src/lib/data/invites.ts:43-45`) writes `usedAt` with no
guard on it, and validate-then-consume has an `await supabase.auth.signUp()` in the middle
(`login/actions.ts:32,50-51`). Two people given the same link can both pass validation and
both get approved.

Fix: make consumption the gate —
`.where(and(eq(invites.id, id), isNull(invites.usedAt)))` and check the affected row count
*before* approving.

Also: `createInvite` (`admin/invites/actions.ts:14-18`) never sets `expiresAt` and no
migration default exists, so the `expired` state the UI advertises
(`admin/invites/page.tsx:8,21`) can never occur. And `signUpWithPassword` approves the
profile and burns the invite **before** email confirmation, so a user who never confirms
permanently consumes an invite (`login/actions.ts:50`). Consider moving the approve +
consume into `/auth/callback`, which already does the OAuth equivalent.

### 9. "Open now" / "Walk-ins OK" silently hide every spot with unknown data
**Confirmed.** `isOpenNow` deliberately returns `null` for "no schedule data, distinct from
a confident closed" (`openingHours.ts:37-38`) — but `src/app/page.tsx:65` compares
`=== true`, collapsing `null` into `false`. Same at `:60` for `isWalkIn !== true`, where
`null` means unknown. A spot never matched on Google just vanishes with no indication, and
given how many spots lack a confirmed location, "Open now" can hide most of the list for
reasons the user can't see.

Fix: surface the count of excluded-for-missing-data spots, the way the map already does at
`page.tsx:379-394`.

### 10. Three admin pages are guarded only by the layout
**Confirmed** as a code smell; the bypass itself was **not** demonstrated.
`admin/invites/page.tsx`, `admin/matches/page.tsx`, and `admin/awards/page.tsx` have no
in-page guard and inherit authorization solely from `admin/layout.tsx:13-14`. Next.js 16's
own bundled auth guide warns against this
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350`): *"Due to Partial
Rendering, be cautious when doing checks in Layouts as these don't re-render on
navigation."*

Matters most for `/admin/invites`, which renders live **invite tokens** — the credential
that flips `isApproved`. `admin/users/page.tsx:9` already does it right. One line each:
`await requireAdmin();` as the first statement.

While there: "is this user an admin" currently has **three** implementations —
`requireAdmin()`, plus two hand-rolled `requireUser()` + `if (!user.isAdmin) redirect("/")`
copies in `admin/layout.tsx` and `restaurants/[id]/edit/page.tsx`. Collapse to one
(e.g. export `requireAdminOrRedirect()` from `guards.ts`).

### 11. Enable RLS on the five tables that never got it
**Latent, not currently exploitable — verified.** RLS is enabled on 11 tables in
`20260727183229_extensions_rls_triggers.sql:28-38` but omits `invites`,
`restaurant_locations`, `restaurant_ratings`, `neighborhoods`, and `cuisine_groups`, and no
policies exist for them.

An audit flagged this as Critical on the theory that Supabase's default `public` grants make
them readable via the anon key. **I checked against production and it is not exploitable**:
every table returns `42501 permission denied` for the `anon` role, including tables that
*do* have RLS — because these tables were created by Drizzle migrations as `postgres`, not
through Supabase's own tooling, so the default grants were never applied.

Still worth doing as defense-in-depth: if anyone ever runs a `GRANT` (via the dashboard, or
by enabling a Supabase feature that does it), those five tables have no policy to fall back
on. Also `revoke all on public.invites from anon, authenticated` explicitly.

Re-verify with:
```bash
curl "$SUPABASE_URL/rest/v1/invites?select=token" -H "apikey: <anon key>"
```

---

## P2 — quality and hygiene

### 12. Adding one spot bills Google Places twice, with a real correctness gap
**Confirmed.** `startAddSpot` searches Google to prefill neighborhood/cuisine
(`add-entry/actions.ts:79-91`), then `submitRecommendation` calls
`queueGoogleMatchCandidates` which searches **again** with an identical query string
(`:164-176` → `googlePlacesMatch.ts:20-30`). Two billed calls per spot added.

Worse, they're *independent* searches: the neighborhood/cuisine the user reviewed came from
search A, while the address/coordinates/rating actually written came from search B. Google's
ranking isn't guaranteed stable between calls, so reviewed data and applied data can
disagree with no way for the user to tell.

Fix: carry step 1's winning `placeId` / ranked list forward in the step-2 params and let
`queueGoogleMatchCandidates` accept pre-fetched candidates.

Same pass should fix a latent oddity: `pickAutoConfirmWinner` runs on the full ranked list
at `:82` but only on **successfully inserted** rows at `:171` (because
`queueGoogleMatchCandidates` uses `onConflictDoNothing` and only pushes returned rows,
`googlePlacesMatch.ts:62-64`). So the "decisively ahead of the runner-up" guarantee in
`fuzzyMatch.ts:157-163` quietly depends on insert success. Not a live bug for a brand-new
restaurant (no conflicts possible), but not a property anyone would expect.

### 13. `Header.tsx` re-implements `getOptionalUser()` — and they've already diverged
**Confirmed.** `src/components/Header.tsx:12-24` does its own `createClient()` →
`auth.getUser()` → `profiles` select rather than calling the guard that exists for exactly
this. They have **already diverged**: `getOptionalUser()` *redirects* to
`/pending-approval` when `isApproved` is false (`guards.ts:47-49`); Header instead silently
sets `canBrowse = false` and hides the nav (`Header.tsx:23`). Two rules answering "who is
this user and what may they see."

Also a real perf cost: **three serialized `auth.getUser()` HTTP calls per request** —
`proxy.ts:41`, `Header.tsx:16`, `guards.ts:39` — with **zero** uses of `React.cache()`
anywhere in the repo. `auth.getUser()` is an HTTP round trip to Supabase, not a local JWT
decode.

Fix: wrap `getOptionalUser` in `React.cache()`, add `isApproved` to `CurrentUser` (it's
already read at `guards.ts:47`, just not returned), and have Header consume it. Drops ~12
lines and 4 imports; 3 auth calls → 2, 2 profile queries → 1.

⚠️ One deliberate decision: the redirect inside `getOptionalUser` would then fire from the
root layout for unapproved users. Arguably more correct than today's split behavior, but it
*is* a behavior change — decide it on purpose rather than letting it happen.

### 14. `guards.test.ts` gives less coverage than it claims
**Confirmed** — flagged independently by two audits. The test added in `9247b2d` has three
holes:
- `findActionFiles` only collects files literally named `actions.ts`, so the **21 inline
  `"use server"` closures** in page components are unscanned (8 in `admin/matches/page.tsx`,
  7 in `restaurants/[id]/page.tsx`, 2 each in `admin/awards` + `admin/users`, 1 each in
  `admin/invites` + `restaurants/[id]/edit`). All 21 currently delegate to guarded actions —
  manually verified — but nothing enforces it.
- It splits on `/^export async function /m`, so `export const foo = async () => {}` in an
  `actions.ts` passes while being unguarded.
- It only checks a guard appears *somewhere* in the chunk, so a guard placed *after* the
  mutation — or sitting in a comment — passes.

Best fix is structural: move those 21 closures into their route's `actions.ts` as real
exports, which makes the test's file-scan assumption *true* rather than aspirational. Most
are one-liners that can be deleted outright (`.bind(null, id)` on an imported action works
identically); the few that also `redirect()` afterward
(e.g. `admin/matches/page.tsx:145-155`) need that preserved. Note moving them changes
generated action IDs — do it in one commit so no in-flight form post straddles a deploy.

### 15. Extract the filter predicate so it can be tested
**Confirmed.** `matchesSearch` and `matchesSharedFilters` (`src/app/page.tsx:26-70`) are the
most intricate business logic in the app — an eight-way predicate including the
cuisine-group-beats-raw-tag resolution that took two commits (`7fc8518`, `856fd2f`) to get
right and earned a 5-line explanatory comment. They're module-private inside a page
component, so they have **zero tests**. Meanwhile four-line `averageRating` has four.

The group-vs-tag rule is also split across two places that must agree: option list built at
`page.tsx:119-131`, filter resolution at `:54-56`. Same file today, which makes it
survivable rather than safe.

Fix: move to `src/lib/data/restaurantFilters.ts` as exported pure functions over
`RestaurantListItem`, add ~10 fixture tests (Japanese matches `cuisine=Asian`; literal
"Asian" tag also matches; raw "Asian" absent from options when the group exists;
`visited=mine` with null user matches nothing; `openNow` uses per-location hours).

### 16. Reporting blind spots in the sync cron
**Confirmed.** Three compounding issues:
- `src/lib/sync/syncRatings.ts:66` unconditionally writes
  `lastSyncError = errors.length > 0 ? … : null`, so a **rotated/missing API key** (skipped
  at `:32`/`:54`) overwrites last week's real error with `null`.
- `runSyncBatch.ts:31-37` only counts a failure when the final `db.update` throws, and
  `syncRestaurantRatings` never throws by design — so the route reports
  `succeeded === total` even if every API call failed.
- **`lastSyncError` is write-only.** Grep confirms it appears only in the schema, that one
  write, and its test. No page or admin view ever reads it.

Net effect: a permanently broken sync is invisible. An "integrations health" admin view was
in the original plan and never built.

### 17. Cuisine-group keyword coverage is thin
**Confirmed.** `src/lib/data/cuisineGroups.ts:11-37` has real holes for a Bay Area dataset:
Asian missing `pho`, `burmese`, `nepalese`, `laotian`, `cambodian`, `poke`, `boba`,
`hot pot`; European missing `german`, `portuguese`, `british`, `polish`, `russian`,
`basque`, `belgian`; Latin American missing `cuban`, `salvadoran`, `colombian`,
`venezuelan`, `guatemalan`. No **African, Caribbean, or Hawaiian/Pacific** group exists at
all — Ethiopian, Nigerian, Jamaican, Hawaiian all classify `null` and are invisible to
group search/filter.

Also a doc/code mismatch: the docstring at `:6-9` says "American is checked last" but the
array puts **Breakfast** last (`:31-36`), so `"American Bakery"` resolves to American, not
Breakfast. Fix the comment or the order — it will mislead the next edit.

Re-run `scripts/backfill-cuisine-groups.ts` after changing keywords (it's idempotent).

### 18. Notes can't be edited or deleted, and the empty state checks the wrong array
**Confirmed.** `editedAt` and `deletedAt` (`schema.ts:224-225`) are **never written by
anything** — no action, no script. No edit/delete UI exists, and the RLS policy at
`20260727183229:93-94` grants an update nothing performs. A typo in a note is permanent.

Separately: the render filters on `!n.deletedAt` (`restaurants/[id]/page.tsx:364`) but the
"No notes yet." fallback tests `restaurant.notes.length === 0` at `:380` — the *unfiltered*
array. If notes ever do get soft-deleted, the section renders completely blank.

### 19. Assorted smaller items
All **confirmed by reading**:
- **N+1 on `/add-entry`** — `add-entry/page.tsx:56-66` runs one query per submission with a
  `possibleDuplicateOf`, inside the render, and the `submissions` query at `:40-42` has no
  `limit`. Both grow forever. Batch with `inArray` (the pattern `admin/invites/page.tsx:30-34`
  already uses correctly) and add `.limit(50)`. Note the map key changes from submission id
  to restaurant id, so the call sites at `:200-203` need `sub.possibleDuplicateOf`.
- **Visit/rating mutations don't revalidate profile pages** —
  `restaurants/actions.ts:109-110` and `:127-128` revalidate `/` and `/restaurants/${id}`
  but not `/users/${user.id}`, which builds its whole activity feed from those tables.
  (Inert today — nothing in the app is cached — but fix before adding any caching.)
- **Auto-confirm margin is duplicated** — `DEFAULT_AUTO_CONFIRM_MARGIN = 0.15` is
  **not exported** from `fuzzyMatch.ts:155` while `scripts/auto-confirm-matches.ts:10`
  hardcodes its own `0.15` and prints it in the summary. The *threshold* half was already
  shared correctly; the margin wasn't. Two-line fix.
- **`markRestaurantClosedNoLocation` isn't idempotent** — `restaurants/actions.ts:195-205`;
  two clicks create two placeholder rows, after which the detail page reports "2 locations"
  for a restaurant with none.
- **`toggleVisited` read-then-write race** — `restaurants/actions.ts:95-107` selects then
  inserts with no `onConflictDoNothing` against the composite PK; a double-click across two
  tabs throws.
- **`updateRestaurant` can throw a raw unique violation** — `restaurants/actions.ts:40-49`
  validates only non-empty name/city; renaming onto an existing `(name, city)` errors. The
  add flow has duplicate detection; the edit flow has none.
- **Confirming a match can throw a raw unique violation** — `matchCandidates.ts:66-67,89-90`
  dedupes only within *this* restaurant's locations, but `googlePlaceId`/`yelpBusinessId`
  are globally unique (`schema.ts:153,161`). Two near-duplicate restaurants sharing a
  place_id, or a double-click on Confirm (`matches/page.tsx:305-312` has no pending state),
  errors.
- **"Regenerate matches" deletes before it refetches, and swallows failures** —
  `admin/matches/actions.ts:51-64`: the DELETE commits, *then* the Google call runs, all
  inside `try {} catch { /* ignored */ }`. Quota exhausted → candidates gone, nothing
  replaces them, page looks like a successful run.
- **`restaurantsWithoutLocation` undercounts** — `page.tsx:188-190` counts restaurants with
  no geolocated location, but `pins` at `:196` *also* excludes `permanently_closed`. A spot
  whose only geolocated location is closed contributes no pin yet isn't counted.
- **Filter combobox lies about an invalid value** — `FilterCombobox.tsx:25` falls back to
  `options[0]` ("All …") when `value` matches nothing while the hidden input at `:83` keeps
  the bad value. `?city=Typo` shows "All cities" and filters to zero.
- **`Retry-After` handling** — `httpRetry.ts:36` does `Number(retryAfter) * 1000`; an
  HTTP-date value (legal per spec) yields `NaN` and `setTimeout(NaN)` fires immediately, so
  all five retries hammer a rate-limited API with no backoff. No upper clamp either
  (`Retry-After: 86400` parks past `maxDuration`), and no `AbortSignal` on any fetch.
- **Approval gate fails open if a profile row is missing** — `guards.ts:47` and
  `auth/callback/route.ts:23` both use `if (profile && !profile.isApproved)`. Unreachable
  today (the `handle_new_user` trigger is `after insert` in the same transaction) but prefer
  `if (!profile || !profile.isApproved)`.
- **Avatar content-type is client-supplied** — `users/actions.ts:31,41` prefix-checks
  `image/` and passes `file.type` straight to `contentType`, so `image/svg+xml` is stored
  and served from a **public** bucket. Cross-origin from the app so it can't reach cookies
  or DOM; ceiling is phishing hosted on a `*.supabase.co` URL. Allow-list the types.
- **Map has no failure state** — `RestaurantMap.tsx:50` does
  `mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!` with no null check and no
  `map.on("error")`. A missing or rate-limited token renders an empty grey box — half the
  home page.
- **Type-safety nits** — `matchCandidates.ts:58` has an unnecessary `!` on a `.notNull()`
  column (positioned exactly where it'd absorb a future nullable change); seven
  `restaurant!` assertions in `restaurants/[id]/edit/page.tsx` after a `notFound()` guard
  that should already narrow.

---

## Decisions needed (not bugs)

- **Anonymous roster exposure.** Since `9247b2d`, an anonymous spot page renders member
  display names *and* clickable `/users/<uuid>` links via "Visited by" and note bylines
  (`restaurants/[id]/page.tsx:328-335`, `:369-372`) — verified against production. Profiles
  themselves are behind sign-in, but a crawler can build the full member roster plus who ate
  where. Either gate that block on `user` or accept it as public.

  Regardless of that decision: `src/lib/data/restaurants.ts:19,34` use
  `with: { user: true }` / `with: { author: true }`, pulling **entire** `profiles` rows
  (`isAdmin`, `isApproved`, `city`, `neighborhoodId`) into the render. Not leaked today —
  nothing serializes them to a client component — but narrow to
  `columns: { id: true, displayName: true, avatarUrl: true }` so a future refactor can't.

- **BestTime / busyness is entirely unbuilt.** `createForecast`
  (`src/lib/integrations/bestTime.ts:57`) has **zero callers anywhere** — no route, no page,
  no script. There's no `/api/cron/sync-busyness` in `vercel.json`, nothing reads or writes
  `restaurant_busyness`, and the home page has **no busyness filter at all**. It's a tested
  parser wired to nothing. Either build it or delete the integration + table.

  If building: note `restaurant_busyness.restaurantId` points at the *restaurant*, not the
  location (`schema.ts:292-306`), so a chain's branches can only share one busyness curve —
  inconsistent with how ratings and hours are modeled per-location. Fix the schema first.

- **Imported spreadsheet data is invisible.** `legacyBeenThere`, `legacyAwardNote`, and
  `mentionCount` (`schema.ts:132-136`) are written only by `scripts/import-excel.ts` and
  read by no UI. All ~320 imported spots show "Not visited" (`page.tsx:361`) and the
  `visited=unvisited` filter counts only `restaurantVisits`, so the spreadsheet's
  "Been There: Yes" is functionally lost. Surface it, migrate it to real visit rows, or drop
  the columns.

- **Playwright is dead weight.** `package.json` declares `"test:e2e": "playwright test"`
  and `@playwright/test`, but there's no `playwright.config.*` and no `e2e/` dir — the
  command fails. `vitest.config.ts:16` even excludes `"e2e"`, which doesn't exist. Either
  delete both, or write one smoke test. (`@testing-library/react` + `jsdom` are also
  currently unused — zero `.test.tsx` files — but those are cheap to keep since they're
  already wired.)

---

## Verified non-issues — don't spend time here

- **Yelp attribution is fine.** Yelp data renders in exactly one place
  (`restaurants/[id]/page.tsx:215-232`) and attribution is present in both branches — linked
  when `yelpUrl` exists, plain text otherwise. Nothing else surfaces Yelp data. (Cosmetic
  only: `{l.yelpReviewCount}` renders blank when null → "( reviews".)
- **`revalidatePath` gaps are inert.** Several exist (`confirmMatch`,
  `confirmAwardCandidate`, `updateProfile`/`uploadAvatar` all revalidate less than they
  change), but **nothing in this app is cached**: no `export const revalidate`, no
  `dynamic`, no `"use cache"`, no `unstable_cache`, no `cacheComponents`, and every page
  calls `cookies()`, forcing per-request rendering. With Next 15+'s `staleTimes.dynamic`
  default of 0 the client router cache doesn't retain them either. Fix before adding
  caching; no user sees them today.
- **The home page fetch-everything is not a perf problem.**
  `getRestaurantsWithRelations()` compiles to **one** SQL statement (Drizzle's pg dialect
  uses lateral joins + `json_build_array`), then filters ~320 rows in JS. Correct at this
  scale; the existing comment at `restaurants.ts:10-11` already says so. Revisit at ~10k
  rows. The real per-request cost is the three auth round trips (item 13).
- **RLS-missing tables are not currently exploitable** — see item 11 for the verification.
- **All mutations are genuinely guarded.** All 26 exported server actions and all 21 inline
  `"use server"` closures were individually traced: every one calls
  `requireUser()`/`requireAdmin()` as its first statement. No IDOR in write paths —
  user-scoped mutations derive the key from `user.id` server-side, never client input.
  `login/actions.ts` is correctly the only unauthenticated one.
- **No SQL injection** (zero raw `sql\`\``/`sql.raw`/`.execute(`), **no XSS sinks** (zero
  `dangerouslySetInnerHTML`/`innerHTML`/`eval`), **no SSRF** (the single `fetch` site in
  `httpRetry.ts:29` is only ever reached with hardcoded hosts).
- **Secrets hygiene is clean.** `.env*` is gitignored; `git log --all --diff-filter=A` shows
  no env/key/pem file was ever committed; `SUPABASE_SERVICE_ROLE_KEY` appears only in
  `.env.example` and standalone `scripts/`, never in `src/`.
- **Code that's in good shape — leave it alone:** `fuzzyMatch.ts` (best-tested and
  best-commented file in the repo), the `schema.ts` comments explaining *why* each
  non-obvious constraint exists, the `db`-parameter injection in `lib/data/*` (it's what
  makes the fake-db tests possible), `getOrCreateNeighborhoodId`'s race handling,
  `src/db/index.ts`'s HMR pool caching, `syncRatings`' per-source error isolation, the
  shared `validateInvite` (duplication solved *correctly*), `isOpenNow`'s timezone handling
  (forces `America/Los_Angeles` rather than trusting server TZ), and `escapeHtml` in
  `RestaurantMap.tsx`.
- **Explicitly rejected as over-engineering at ~20 users / ~320 rows:** pushing filters into
  SQL, any caching layer or ISR, Redis, a repository layer over Drizzle, Zod on `FormData`,
  a runtime harness for the auth guards, extracting repeated Tailwind class strings into
  components, splitting files on size alone, and consolidating the two identical
  `OpeningHours` type declarations.
