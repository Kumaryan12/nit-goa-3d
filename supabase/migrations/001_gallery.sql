-- Apply once in Supabase SQL Editor as the project owner. No privileged key is used by the browser.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Campus member' check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  location_id text not null check (location_id in ('academic-block','administration-block','boys-hostel','girls-hostel','canteen','sports-ground','main-entrance')),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_display_name text not null default 'Campus member',
  storage_path text not null unique,
  caption text not null check (char_length(trim(caption)) between 1 and 500),
  width integer not null check (width between 1 and 2048), height integer not null check (height between 1 and 2048),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  like_count integer not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (storage_path = author_id::text || '/' || id::text || '/original.webp')
);
create table public.photo_likes (
  id uuid primary key default gen_random_uuid(), photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), unique(photo_id,user_id)
);
create table public.photo_reports (
  id uuid primary key default gen_random_uuid(), photo_id uuid not null references public.photos(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 500), created_at timestamptz not null default now(), unique(photo_id,reporter_id)
);
create index photos_location_recent on public.photos(location_id,created_at desc) where status='approved';
create index photos_recent on public.photos(status,created_at desc);
create index photos_popular on public.photos(like_count desc,created_at desc) where status='approved';
create index photos_author on public.photos(author_id);
create index likes_user on public.photo_likes(user_id);
create index reports_recent on public.photo_reports(created_at desc);

create function public.photo_insert_defaults() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Snapshot a profile label; clients cannot supply an arbitrary author name or counters.
  new.author_display_name := coalesce((select display_name from public.profiles where id=new.author_id),'Campus member');
  new.like_count := 0; new.created_at := now(); new.updated_at := now();
  return new;
end $$;
create trigger photo_defaults before insert on public.photos for each row execute function public.photo_insert_defaults();
create function public.photo_touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at := now(); return new; end $$;
create trigger photo_updated before update on public.photos for each row execute function public.photo_touch();
create function public.photo_like_counter() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Atomic increments avoid lost counts under concurrent likes. This function is trigger-only.
  if TG_OP='INSERT' then update public.photos set like_count=like_count+1 where id=new.photo_id; return new;
  else update public.photos set like_count=greatest(0,like_count-1) where id=old.photo_id; return old; end if;
end $$;
create trigger like_counter after insert or delete on public.photo_likes for each row execute function public.photo_like_counter();
revoke all on function public.photo_insert_defaults(),public.photo_touch(),public.photo_like_counter() from public,anon,authenticated;

alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.photo_likes enable row level security;
alter table public.photo_reports enable row level security;
revoke all on public.profiles,public.photos,public.photo_likes,public.photo_reports from anon,authenticated;
grant select on public.profiles to authenticated;
grant insert(id,display_name),update(display_name) on public.profiles to authenticated;
create policy profile_own_read on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy profile_own_insert on public.profiles for insert to authenticated with check (id=(select auth.uid()));
create policy profile_own_update on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

grant select on public.photos to anon,authenticated;
grant insert(id,location_id,author_id,storage_path,caption,width,height,status) on public.photos to authenticated;
grant delete on public.photos to authenticated;
-- Anonymous users only see approved rows. Owners can recover their own pending submission on retry.
create policy photos_approved_read on public.photos for select to anon,authenticated using (status='approved');
create policy photos_owner_read on public.photos for select to authenticated using (author_id=(select auth.uid()));
create policy photos_owner_pending_insert on public.photos for insert to authenticated with check (author_id=(select auth.uid()) and status='pending' and like_count=0);
create policy photos_owner_delete on public.photos for delete to authenticated using (author_id=(select auth.uid()));
-- No ordinary UPDATE grant or policy: users cannot approve uploads or edit other photos.

grant select,delete on public.photo_likes to authenticated;
grant insert(photo_id,user_id) on public.photo_likes to authenticated;
create policy likes_own_read on public.photo_likes for select to authenticated using (user_id=(select auth.uid()));
create policy likes_approved_insert on public.photo_likes for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.photos where id=photo_id and status='approved'));
create policy likes_own_delete on public.photo_likes for delete to authenticated using (user_id=(select auth.uid()));
grant insert(photo_id,reporter_id,reason) on public.photo_reports to authenticated;
create policy reports_approved_insert on public.photo_reports for insert to authenticated with check (reporter_id=(select auth.uid()) and exists(select 1 from public.photos where id=photo_id and status='approved'));
-- Reports are private to moderators; no client SELECT, UPDATE or DELETE permission.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('campus-gallery','campus-gallery',false,4194304,array['image/webp']);
-- The private bucket never exposes pending photos through permanent public URLs.
create policy campus_gallery_insert on storage.objects for insert to authenticated with check (
 bucket_id='campus-gallery' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(original|thumbnail)\.webp$')
 and lower(metadata->>'mimetype')='image/webp'
);
create policy campus_gallery_owner_read on storage.objects for select to authenticated using (bucket_id='campus-gallery' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy campus_gallery_owner_delete on storage.objects for delete to authenticated using (bucket_id='campus-gallery' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy campus_gallery_approved_read on storage.objects for select to anon,authenticated using (
 bucket_id='campus-gallery' and exists(select 1 from public.photos p where p.status='approved' and (name=p.storage_path or name=replace(p.storage_path,'/original.webp','/thumbnail.webp')))
);
-- No storage UPDATE: uploads use immutable UUID paths and upsert=false.
commit;
