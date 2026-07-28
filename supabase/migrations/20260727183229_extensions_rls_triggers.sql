-- Extensions
create extension if not exists pg_trgm;

-- Auto-create a profiles row whenever Supabase Auth creates a new auth.users row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.cuisines enable row level security;
alter table public.restaurant_cuisines enable row level security;
alter table public.restaurant_visits enable row level security;
alter table public.restaurant_notes enable row level security;
alter table public.restaurant_awards enable row level security;
alter table public.award_scrape_candidates enable row level security;
alter table public.restaurant_match_candidates enable row level security;
alter table public.restaurant_busyness enable row level security;
alter table public.restaurant_recommendations enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- profiles: everyone authenticated can read all profiles (needed to show "visited by" names);
-- a user can update only their own profile; admins can update any.
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin());

-- restaurants: readable by any authenticated user; only admins write core fields.
create policy "restaurants_select_authenticated" on public.restaurants
  for select to authenticated using (true);
create policy "restaurants_write_admin" on public.restaurants
  for insert to authenticated with check (public.is_admin());
create policy "restaurants_update_admin" on public.restaurants
  for update to authenticated using (public.is_admin());
create policy "restaurants_delete_admin" on public.restaurants
  for delete to authenticated using (public.is_admin());

-- cuisines / restaurant_cuisines: readable by all, writable by admins only.
create policy "cuisines_select_authenticated" on public.cuisines
  for select to authenticated using (true);
create policy "cuisines_write_admin" on public.cuisines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "restaurant_cuisines_select_authenticated" on public.restaurant_cuisines
  for select to authenticated using (true);
create policy "restaurant_cuisines_write_admin" on public.restaurant_cuisines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- restaurant_visits: any authenticated user can read all (to show who's visited),
-- but can only insert/delete their own row.
create policy "restaurant_visits_select_authenticated" on public.restaurant_visits
  for select to authenticated using (true);
create policy "restaurant_visits_insert_own" on public.restaurant_visits
  for insert to authenticated with check (user_id = auth.uid());
create policy "restaurant_visits_delete_own" on public.restaurant_visits
  for delete to authenticated using (user_id = auth.uid());

-- restaurant_notes: any authenticated user can read and add notes; only the author
-- (or an admin) can edit/soft-delete their own note.
create policy "restaurant_notes_select_authenticated" on public.restaurant_notes
  for select to authenticated using (true);
create policy "restaurant_notes_insert_own" on public.restaurant_notes
  for insert to authenticated with check (author_id = auth.uid());
create policy "restaurant_notes_update_own_or_admin" on public.restaurant_notes
  for update to authenticated using (author_id = auth.uid() or public.is_admin());

-- restaurant_awards: readable by all; only ever written by an admin's confirm action.
create policy "restaurant_awards_select_authenticated" on public.restaurant_awards
  for select to authenticated using (true);
create policy "restaurant_awards_write_admin" on public.restaurant_awards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Review queues (scraper/matcher output) and busyness data: admin-only, not user-facing.
create policy "award_scrape_candidates_admin_only" on public.award_scrape_candidates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "restaurant_match_candidates_admin_only" on public.restaurant_match_candidates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "restaurant_busyness_select_authenticated" on public.restaurant_busyness
  for select to authenticated using (true);

-- restaurant_recommendations: any authenticated user can read/submit; only admins
-- (or the original submitter) can see the review outcome update, admins can review.
create policy "restaurant_recommendations_select_authenticated" on public.restaurant_recommendations
  for select to authenticated using (true);
create policy "restaurant_recommendations_insert_own" on public.restaurant_recommendations
  for insert to authenticated with check (suggested_by = auth.uid());
create policy "restaurant_recommendations_review_admin" on public.restaurant_recommendations
  for update to authenticated using (public.is_admin());
