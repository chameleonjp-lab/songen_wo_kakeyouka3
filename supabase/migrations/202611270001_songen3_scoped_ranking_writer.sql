begin;

-- The game server only needs to call the existing Songen 3 event writer.
create table if not exists songen3_online_ranking.writer_credential (
  singleton boolean primary key default true check (singleton),
  key_hash bytea not null check (octet_length(key_hash) = 32)
);
alter table songen3_online_ranking.writer_credential enable row level security;
revoke all on table songen3_online_ranking.writer_credential from public, anon, authenticated, service_role;

create or replace function public.submit_songen3_online_event(p_event jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text := coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb->>'x-songen3-ranking-key', '');
begin
  if token !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from songen3_online_ranking.writer_credential
    where singleton and key_hash = extensions.digest(token, 'sha256')
  ) then
    raise exception 'Ranking writer authentication required' using errcode = 'PT403';
  end if;
  if p_event is null then return true; end if;
  return public.record_songen3_online_event(p_event);
end;
$$;

revoke all on function public.submit_songen3_online_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_songen3_online_event(jsonb) to anon;
grant execute on function public.songen3_online_stats_v1(),
  public.songen3_online_board_v1(text, integer, integer) to anon, authenticated;
notify pgrst, 'reload schema';

commit;
