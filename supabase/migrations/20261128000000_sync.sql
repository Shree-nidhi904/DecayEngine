-- Decay Engine cloud sync (optional; the apps work without it).
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
--
-- One row per user and app. `body` is the app's backup file text, or, when the
-- user set a passphrase, an encrypted envelope of it that the server cannot read.
-- Clients may only READ their own rows. Every write goes through push_snapshot,
-- which checks the revision the client last saw, so two devices cannot overwrite
-- each other.

create table if not exists public.snapshots (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  app        text        not null check (app in ('ghosted', 'study-dungeon')),
  revision   integer     not null check (revision >= 1),
  device_id  text        not null check (length(device_id) between 1 and 100),
  encrypted  boolean     not null default false,
  body       text        not null check (length(body) <= 5000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, app)
);

alter table public.snapshots enable row level security;

drop policy if exists "read own snapshots" on public.snapshots;
create policy "read own snapshots" on public.snapshots
  for select to authenticated
  using (auth.uid() = user_id);

-- No insert, update or delete policy on purpose: with RLS on, that denies them.
revoke all on public.snapshots from anon, authenticated;
grant select on public.snapshots to authenticated;

-- Writes a snapshot if the caller's expected revision is still current.
-- Returns {ok: true, revision, server_time}, or {ok: false, current: <row or null>}.
create or replace function public.push_snapshot(
  p_app text,
  p_expected_revision integer,
  p_device_id text,
  p_encrypted boolean,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur public.snapshots;
  new_revision integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into cur from public.snapshots where user_id = uid and app = p_app for update;

  if not found then
    if p_expected_revision <> 0 then
      return jsonb_build_object('ok', false, 'current', null);
    end if;
    begin
      insert into public.snapshots (user_id, app, revision, device_id, encrypted, body)
      values (uid, p_app, 1, p_device_id, p_encrypted, p_body);
    exception when unique_violation then
      -- Another device inserted between our check and our insert.
      select * into cur from public.snapshots where user_id = uid and app = p_app;
      return jsonb_build_object('ok', false, 'current', to_jsonb(cur) - 'user_id');
    end;
    new_revision := 1;
  else
    if cur.revision <> p_expected_revision then
      return jsonb_build_object('ok', false, 'current', to_jsonb(cur) - 'user_id');
    end if;
    new_revision := cur.revision + 1;
    update public.snapshots
       set revision = new_revision, device_id = p_device_id, encrypted = p_encrypted,
           body = p_body, updated_at = now()
     where user_id = uid and app = p_app;
  end if;

  return jsonb_build_object('ok', true, 'revision', new_revision, 'server_time', now());
end;
$$;

revoke all on function public.push_snapshot(text, integer, text, boolean, text) from public, anon;
grant execute on function public.push_snapshot(text, integer, text, boolean, text) to authenticated;

-- Deletes the caller's account; their snapshots go with it (on delete cascade).
create or replace function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
