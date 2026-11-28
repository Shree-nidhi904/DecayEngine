-- Decay Engine Web Push (optional; needs the sync migration first).
-- Run in the Supabase SQL editor after 20261128000000_sync.sql.
--
-- The server never learns what is in the user's data. The device works out WHEN
-- something next needs attention and uploads only that time plus a generic title
-- and body. A function (send-due-pushes) runs every minute, sends what is due to
-- the user's subscribed browsers, and clears it. At most one push per user and
-- app every 24 hours. Quiet hours are applied on the device, which knows its
-- own time zone.
--
-- Clients can neither read nor write these tables directly; they call the four
-- functions below. The Edge Function uses the service role, which bypasses RLS.

create table if not exists public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  app        text        not null check (app in ('ghosted', 'study-dungeon')),
  endpoint   text        not null unique check (length(endpoint) <= 2000),
  p256dh     text        not null check (length(p256dh) <= 200),
  auth       text        not null check (length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_app on public.push_subscriptions (user_id, app);

create table if not exists public.push_schedule (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  app          text        not null check (app in ('ghosted', 'study-dungeon')),
  -- Null once sent, or when nothing is due.
  notify_at    timestamptz,
  title        text        not null check (length(title) <= 100),
  body         text        not null check (length(body) <= 300),
  last_sent_at timestamptz,
  primary key (user_id, app)
);
create index if not exists push_schedule_due on public.push_schedule (notify_at) where notify_at is not null;

alter table public.push_subscriptions enable row level security;
alter table public.push_schedule enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_schedule from anon, authenticated;
-- No policies: with RLS on, that denies everything except the service role.

-- Remembers a browser's push subscription for the caller. An endpoint that was
-- registered by someone else before (a shared browser) moves to the caller.
-- At most 10 per user and app; the oldest go first.
create or replace function public.register_push(
  p_app text, p_endpoint text, p_p256dh text, p_auth text
) returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  insert into public.push_subscriptions (user_id, app, endpoint, p256dh, auth)
  values (uid, p_app, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, app = excluded.app, p256dh = excluded.p256dh, auth = excluded.auth;
  delete from public.push_subscriptions
   where user_id = uid and app = p_app
     and id not in (
       select id from public.push_subscriptions
        where user_id = uid and app = p_app order by created_at desc limit 10);
end;
$$;

create or replace function public.unregister_push(p_endpoint text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- Sets when the next push is due. Never earlier than 24 hours after the last
-- one sent, and never more than 60 days away.
create or replace function public.set_push_schedule(
  p_app text, p_notify_at timestamptz, p_title text, p_body text
) returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  last_sent timestamptz;
  at timestamptz;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select last_sent_at into last_sent from public.push_schedule where user_id = uid and app = p_app;
  at := greatest(p_notify_at, coalesce(last_sent + interval '24 hours', '-infinity'::timestamptz));
  if at > now() + interval '60 days' then
    at := null;
  end if;
  insert into public.push_schedule (user_id, app, notify_at, title, body)
  values (uid, p_app, at, p_title, p_body)
  on conflict (user_id, app) do update
    set notify_at = excluded.notify_at, title = excluded.title, body = excluded.body;
  return at;
end;
$$;

create or replace function public.clear_push_schedule(p_app text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  update public.push_schedule set notify_at = null where user_id = auth.uid() and app = p_app;
end;
$$;

revoke all on function public.register_push(text, text, text, text) from public, anon;
revoke all on function public.unregister_push(text) from public, anon;
revoke all on function public.set_push_schedule(text, timestamptz, text, text) from public, anon;
revoke all on function public.clear_push_schedule(text) from public, anon;
grant execute on function public.register_push(text, text, text, text) to authenticated;
grant execute on function public.unregister_push(text) to authenticated;
grant execute on function public.set_push_schedule(text, timestamptz, text, text) to authenticated;
grant execute on function public.clear_push_schedule(text) to authenticated;
