-- Maintenance Hub normalized Supabase schema.
-- Run this in the Supabase SQL editor before deploying the updated frontend.
-- This keeps the browser on the publishable key while moving the real security
-- boundary to RLS and authenticated admin JWT claims.

create table if not exists public.categories (
  id text primary key,
  parent_id text references public.categories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media (
  id text primary key,
  category_id text not null references public.categories(id) on delete cascade,
  name text not null,
  url text,
  storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_has_source check (url is not null or storage_path is not null)
);

create index if not exists categories_parent_sort_idx
  on public.categories(parent_id, sort_order, name);

create index if not exists media_category_sort_idx
  on public.media(category_id, sort_order, name);

alter table public.categories enable row level security;
alter table public.media enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.media to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.media to authenticated;

drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories"
  on public.categories for select
  to anon, authenticated
  using (true);

drop policy if exists "Admin write categories" on public.categories;
create policy "Admin write categories"
  on public.categories for all
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or (
      jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
      and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
    )
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or (
      jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
      and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
    )
  );

drop policy if exists "Public read media" on public.media;
create policy "Public read media"
  on public.media for select
  to anon, authenticated
  using (true);

drop policy if exists "Admin write media" on public.media;
create policy "Admin write media"
  on public.media for all
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or (
      jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
      and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
    )
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or (
      jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
      and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'maintenance-media',
  'maintenance-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read maintenance media files" on storage.objects;
create policy "Public read maintenance media files"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'maintenance-media');

drop policy if exists "Admin insert maintenance media files" on storage.objects;
create policy "Admin insert maintenance media files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'maintenance-media'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or (
        jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
        and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
      )
    )
  );

drop policy if exists "Admin update maintenance media files" on storage.objects;
create policy "Admin update maintenance media files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'maintenance-media'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or (
        jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
        and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
      )
    )
  )
  with check (
    bucket_id = 'maintenance-media'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or (
        jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
        and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
      )
    )
  );

drop policy if exists "Admin delete maintenance media files" on storage.objects;
create policy "Admin delete maintenance media files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'maintenance-media'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or (
        jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
        and (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
      )
    )
  );

-- Example: mark a specific existing user as an admin.
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'admin@example.com';
