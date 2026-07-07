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
  file_name text,
  url text,
  storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_has_source check (url is not null or storage_path is not null)
);

create table if not exists public.departments (
  id text primary key,
  name text not null,
  landing_title text not null default '',
  landing_subtitle text not null default '',
  landing_hero_image text not null default '',
  category_ids jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_category_ids_array check (jsonb_typeof(category_ids) = 'array')
);

alter table public.media
  add column if not exists file_name text;

update public.media
  set file_name = name
  where file_name is null;

create index if not exists categories_parent_sort_idx
  on public.categories(parent_id, sort_order, name);

create index if not exists media_category_sort_idx
  on public.media(category_id, sort_order, name);

create index if not exists departments_sort_idx
  on public.departments(sort_order, name);

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.has_app_role(required_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = any(required_roles)
    or (
      jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
      and exists (
        select 1
        from jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'roles') as role_name(value)
        where role_name.value = any(required_roles)
      )
    );
$$;

grant usage on schema private to authenticated;
grant execute on function private.has_app_role(text[]) to authenticated;

alter table public.categories enable row level security;
alter table public.media enable row level security;
alter table public.departments enable row level security;

revoke usage on schema public from public;
revoke usage on schema public from anon;
revoke select on public.categories from public;
revoke select on public.media from public;
revoke select on public.departments from public;
revoke select on public.categories from anon;
revoke select on public.media from anon;
revoke select on public.departments from anon;

grant usage on schema public to authenticated;
grant select on public.categories to authenticated;
grant select on public.media to authenticated;
grant select on public.departments to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.media to authenticated;
grant insert, update, delete on public.departments to authenticated;

drop policy if exists "Public read categories" on public.categories;
drop policy if exists "Authenticated read categories" on public.categories;
create policy "Authenticated read categories"
  on public.categories for select
  to authenticated
  using (private.has_app_role(array['admin', 'technician', 'portal_user']));

drop policy if exists "Admin write categories" on public.categories;
create policy "Admin write categories"
  on public.categories for all
  to authenticated
  using (private.has_app_role(array['admin']))
  with check (private.has_app_role(array['admin']));

drop policy if exists "Public read media" on public.media;
drop policy if exists "Authenticated read media" on public.media;
create policy "Authenticated read media"
  on public.media for select
  to authenticated
  using (private.has_app_role(array['admin', 'technician', 'portal_user']));

drop policy if exists "Admin write media" on public.media;
create policy "Admin write media"
  on public.media for all
  to authenticated
  using (private.has_app_role(array['admin']))
  with check (private.has_app_role(array['admin']));

drop policy if exists "Authenticated read departments" on public.departments;
create policy "Authenticated read departments"
  on public.departments for select
  to authenticated
  using (private.has_app_role(array['admin', 'technician', 'portal_user']));

drop policy if exists "Admin write departments" on public.departments;
create policy "Admin write departments"
  on public.departments for all
  to authenticated
  using (private.has_app_role(array['admin']))
  with check (private.has_app_role(array['admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'maintenance-media',
  'maintenance-media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/ogg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read maintenance media files" on storage.objects;
drop policy if exists "Authenticated read maintenance media files" on storage.objects;
create policy "Authenticated read maintenance media files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'maintenance-media'
    and private.has_app_role(array['admin', 'technician', 'portal_user'])
  );

drop policy if exists "Admin insert maintenance media files" on storage.objects;
create policy "Admin insert maintenance media files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'maintenance-media'
    and private.has_app_role(array['admin'])
  );

drop policy if exists "Admin update maintenance media files" on storage.objects;
create policy "Admin update maintenance media files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'maintenance-media'
    and private.has_app_role(array['admin'])
  )
  with check (
    bucket_id = 'maintenance-media'
    and private.has_app_role(array['admin'])
  );

drop policy if exists "Admin delete maintenance media files" on storage.objects;
create policy "Admin delete maintenance media files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'maintenance-media'
    and private.has_app_role(array['admin'])
  );

create or replace function private.delete_media_row_for_storage_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.bucket_id = 'maintenance-media' then
    delete from public.media
    where storage_path = old.name;
  end if;

  return old;
end;
$$;

drop trigger if exists delete_media_row_for_storage_object on storage.objects;
create trigger delete_media_row_for_storage_object
  after delete on storage.objects
  for each row
  execute function private.delete_media_row_for_storage_object();

delete from public.media as media
where media.storage_path is not null
  and not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'maintenance-media'
      and object.name = media.storage_path
  );

-- Example: mark a specific existing user as an admin.
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'admin@example.com';
--
-- Example: mark a user as a read-only portal user.
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"portal_user"}'::jsonb
-- where email = 'user@example.com';
