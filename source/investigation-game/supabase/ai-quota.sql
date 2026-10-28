begin;

create table public.factorlab_ai_usage (
  bucket text primary key check (char_length(bucket) between 1 and 48),
  window_day date not null,
  used integer not null default 0 check (used >= 0),
  last_at timestamptz
);

alter table public.factorlab_ai_usage enable row level security;
revoke all on table public.factorlab_ai_usage from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on table public.factorlab_ai_usage to service_role;

create function public.factorlab_ai_take(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
set lock_timeout = '3s'
as $$
declare
  v_global public.factorlab_ai_usage%rowtype;
  v_user public.factorlab_ai_usage%rowtype;
  v_now timestamptz;
  v_day date;
  v_bucket text;
  v_retry integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Only the AI gateway may reserve quota' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'User identity is required' using errcode = '22023';
  end if;
  v_bucket := 'user:' || p_user_id::text;
  insert into public.factorlab_ai_usage (bucket, window_day)
    values ('global', (clock_timestamp() at time zone 'Asia/Shanghai')::date)
    on conflict (bucket) do nothing;

  -- A shared row lock prevents concurrent Edge Function instances overspending either cap.
  select * into strict v_global from public.factorlab_ai_usage
    where bucket = 'global' for update;
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'Asia/Shanghai')::date;
  v_retry := greatest(1, ceil(extract(epoch from
    (((v_day + 1)::timestamp at time zone 'Asia/Shanghai') - v_now)))::integer);

  if v_global.window_day <> v_day then
    update public.factorlab_ai_usage set window_day = v_day, used = 0
      where bucket = 'global' returning * into v_global;
  end if;
  if v_global.used >= 200 then
    return jsonb_build_object('allowed', false, 'reason', 'global_daily', 'retry_after', v_retry);
  end if;

  insert into public.factorlab_ai_usage (bucket, window_day)
    values (v_bucket, v_day) on conflict (bucket) do nothing;
  select * into strict v_user from public.factorlab_ai_usage
    where bucket = v_bucket for update;
  if v_user.window_day <> v_day then
    update public.factorlab_ai_usage set window_day = v_day, used = 0
      where bucket = v_bucket returning * into v_user;
  end if;
  if v_user.used >= 20 then
    return jsonb_build_object('allowed', false, 'reason', 'user_daily', 'retry_after', v_retry);
  end if;
  if v_user.last_at is not null and v_now < v_user.last_at + interval '10 seconds' then
    return jsonb_build_object('allowed', false, 'reason', 'cooldown', 'retry_after',
      greatest(1, ceil(extract(epoch from (v_user.last_at + interval '10 seconds' - v_now)))::integer));
  end if;

  -- Reservations remain consumed after provider errors because the provider may already have billed.
  update public.factorlab_ai_usage set used = used + 1, last_at = v_now
    where bucket in ('global', v_bucket);
  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.factorlab_ai_take(uuid) from public, anon, authenticated;
grant execute on function public.factorlab_ai_take(uuid) to service_role;
