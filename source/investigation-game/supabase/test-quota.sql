do $$
declare
  role_name text;
  permission_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_function_privilege(role_name, 'public.factorlab_ai_take(uuid)', 'EXECUTE') then
      raise exception 'Client role can bypass the AI gateway';
    end if;
    foreach permission_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege(role_name, 'public.factorlab_ai_usage', permission_name) then
        raise exception 'Client role can access quota counters';
      end if;
    end loop;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.factorlab_ai_usage'::regclass) then
    raise exception 'Quota RLS is not enabled';
  end if;
  if not has_function_privilege('service_role', 'public.factorlab_ai_take(uuid)', 'EXECUTE') then
    raise exception 'Cloud function cannot use quota service';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  test_user uuid := '00000000-0000-4000-8000-000000000001';
  second_user uuid := '00000000-0000-4000-8000-000000000002';
  answer jsonb;
  n integer;
begin
  -- The inner exception rolls back every test counter before installation commits.
  begin
    answer := public.factorlab_ai_take(test_user);
    if answer ->> 'allowed' is distinct from 'true' then raise exception 'First call rejected'; end if;
    answer := public.factorlab_ai_take(test_user);
    if answer ->> 'allowed' is distinct from 'false' or answer ->> 'reason' is distinct from 'cooldown' then
      raise exception 'Cooldown failed';
    end if;
    if (select used from public.factorlab_ai_usage where bucket = 'global') <> 1 then
      raise exception 'Denied call consumed quota';
    end if;
    for n in 2..20 loop
      update public.factorlab_ai_usage set last_at = clock_timestamp() - interval '11 seconds'
        where bucket = 'user:' || test_user::text;
      answer := public.factorlab_ai_take(test_user);
      if answer ->> 'allowed' is distinct from 'true' then raise exception 'Daily allowance too low'; end if;
    end loop;
    answer := public.factorlab_ai_take(test_user);
    if answer ->> 'allowed' is distinct from 'false' or answer ->> 'reason' is distinct from 'user_daily' then
      raise exception 'User daily cap failed';
    end if;
    answer := public.factorlab_ai_take(second_user);
    if answer ->> 'allowed' is distinct from 'true' then raise exception 'User counters not isolated'; end if;
    update public.factorlab_ai_usage set used = 200 where bucket = 'global';
    answer := public.factorlab_ai_take(second_user);
    if answer ->> 'allowed' is distinct from 'false' or answer ->> 'reason' is distinct from 'global_daily' then
      raise exception 'Global cap failed';
    end if;
    update public.factorlab_ai_usage
      set window_day = (clock_timestamp() at time zone 'Asia/Shanghai')::date - 1,
          last_at = clock_timestamp() - interval '1 day';
    answer := public.factorlab_ai_take(test_user);
    if answer ->> 'allowed' is distinct from 'true' then raise exception 'Daily reset failed'; end if;
    if (select used from public.factorlab_ai_usage where bucket = 'global') <> 1 then
      raise exception 'Global reset failed';
    end if;
    if (select used from public.factorlab_ai_usage where bucket = 'user:' || test_user::text) <> 1 then
      raise exception 'User reset failed';
    end if;
    raise exception using errcode = 'Z0001', message = 'quota_test_rollback';
  exception when sqlstate 'Z0001' then null;
  end;
  if exists (select 1 from public.factorlab_ai_usage) then
    raise exception 'Test counters were not rolled back';
  end if;
end;
$$;

reset role;
