begin;
-- Profiles are optional; account permissions live in a separate, locked table.
alter table public.profiles add column handle text unique,
  add column bio text not null default '',
  add column course text not null default '',
  add column interests text[] not null default '{}',
  add column avatar_color text not null default 'forest',
  add column is_public boolean not null default false;
alter table public.profiles add constraint profile_handle check (
  handle is null or (handle ~ '^[a-z][a-z0-9_]{2,23}$' and handle not in ('admin','administrator','moderator','support','nitgoa','official','campus','system'))),
  add constraint profile_bio check (char_length(bio) <= 280),
  add constraint profile_course check (char_length(course) <= 80),
  add constraint profile_interests check (cardinality(interests) <= 5 and char_length(array_to_string(interests, ',')) <= 160),
  add constraint profile_color check (avatar_color in ('forest','clay','ocean','plum')),
  add constraint public_profile_complete check (not is_public or handle is not null);
grant select on public.profiles to anon;
grant update(handle,bio,course,interests,avatar_color,is_public) on public.profiles to authenticated;
create policy profiles_public_read on public.profiles for select to anon,authenticated using (is_public);

create table public.campus_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','moderator','admin')),
  status text not null default 'active' check (status in ('active','banned')),
  updated_at timestamptz not null default now()
);
alter table public.campus_members enable row level security;
grant select on public.campus_members to authenticated;
create policy membership_own_read on public.campus_members for select to authenticated using (auth.uid() = user_id);
create table public.campus_moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('ban','unban','kick','end-stage')),
  reason text not null check (char_length(reason) between 1 and 240),
  created_at timestamptz not null default now()
);
alter table public.campus_moderation_log enable row level security;
-- No direct grants for moderation logs or membership writes.
create function public.provision_campus_member() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict do nothing;
  insert into public.campus_members(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.provision_campus_member() from public,anon,authenticated;
create trigger provision_campus_member after insert on auth.users for each row execute function public.provision_campus_member();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.campus_members(user_id) select id from auth.users on conflict do nothing;

create function public.campus_access() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',m.user_id,'role',m.role,'status',m.status,'name',p.display_name)
  from public.campus_members m join public.profiles p on p.id=m.user_id where m.user_id=auth.uid();
$$;
revoke all on function public.campus_access() from public,anon;
grant execute on function public.campus_access() to authenticated;

create function public.moderate_campus(target uuid, action text, reason text) returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; target_role text;
begin
  select m.role into actor_role from public.campus_members m where m.user_id=auth.uid() and m.status='active';
  select m.role into target_role from public.campus_members m where m.user_id=target;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Authenticator verification required' using errcode='42501';
  end if;
  if actor_role is null or actor_role not in ('admin','moderator') or target_role is null or target=auth.uid()
    or target_role='admin' or (actor_role='moderator' and target_role='moderator') then
    raise exception 'Not permitted' using errcode='42501';
  end if;
  if action not in ('ban','unban','kick','end-stage') or reason is null or char_length(trim(reason)) not between 1 and 240 then
    raise exception 'Invalid moderation action' using errcode='22023';
  end if;
  if action in ('ban','unban') then
    update public.campus_members set status=case when action='ban' then 'banned' else 'active' end,updated_at=now() where user_id=target;
  end if;
  insert into public.campus_moderation_log(actor_id,target_id,action,reason) values(auth.uid(),target,action,trim(reason));
end $$;
revoke all on function public.moderate_campus(uuid,text,text) from public,anon;
grant execute on function public.moderate_campus(uuid,text,text) to authenticated;

create function public.campus_is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.campus_members where user_id=auth.uid() and status='active');
$$;
revoke all on function public.campus_is_active() from public,anon;
grant execute on function public.campus_is_active() to authenticated;
-- Restrictive policies combine with the existing owner/approval policies.
create policy profile_active_insert on public.profiles as restrictive for insert to authenticated with check(public.campus_is_active());
create policy profile_active_update on public.profiles as restrictive for update to authenticated using(public.campus_is_active()) with check(public.campus_is_active());
create policy photos_active_insert on public.photos as restrictive for insert to authenticated with check(public.campus_is_active());
create policy photos_active_delete on public.photos as restrictive for delete to authenticated using(public.campus_is_active());
create policy likes_active_insert on public.photo_likes as restrictive for insert to authenticated with check(public.campus_is_active());
create policy likes_active_delete on public.photo_likes as restrictive for delete to authenticated using(public.campus_is_active());
create policy reports_active_insert on public.photo_reports as restrictive for insert to authenticated with check(public.campus_is_active());
create policy storage_active_insert on storage.objects as restrictive for insert to authenticated with check(public.campus_is_active());
create policy storage_active_delete on storage.objects as restrictive for delete to authenticated using(public.campus_is_active());
create function public.campus_profile_visible(profile_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p join public.campus_members m on m.user_id=p.id where p.id=profile_id and p.is_public and m.status='active');
$$;
revoke all on function public.campus_profile_visible(uuid) from public;
grant execute on function public.campus_profile_visible(uuid) to anon,authenticated;
alter policy profiles_public_read on public.profiles using(is_public and public.campus_profile_visible(id));
create index profiles_public_recent on public.profiles(created_at desc,id) where is_public;
commit;
