-- The server's clock, so an app can tell when the device's own clock is far off.
-- Reveals nothing but the time; safe for anyone to call.
create or replace function public.server_time() returns timestamptz
language sql stable
as $$ select now() $$;

grant execute on function public.server_time() to anon, authenticated;
