-- Prepared from the public browser adapter contract for a NEW Supabase project.
-- Not a copy of the live schema; not yet executed or verified in PostgreSQL.
-- Existing objects deliberately fail rather than silently change a live deployment.
begin;

create table public.factorlab_saves (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 12),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  envelope jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factorlab_saves_owner_slot unique (user_id, slot),
  constraint factorlab_saves_envelope_shape check (
    jsonb_typeof(envelope) = 'object'
    and (envelope ->> 'version') is not distinct from 'factorlab-ui-v3'
    and jsonb_typeof(envelope -> 'game') is not distinct from 'object'
  ),
  -- JSONB text adds spaces; this ceiling accommodates the client's 480000-byte compact JSON limit.
  constraint factorlab_saves_envelope_size check (octet_length(envelope::text) <= 1048576)
);

alter table public.factorlab_saves enable row level security;
alter table public.factorlab_saves force row level security;

revoke all on table public.factorlab_saves from public, anon, authenticated, service_role;
grant select on table public.factorlab_saves to authenticated;
grant insert (slot, name, envelope) on table public.factorlab_saves to authenticated;
grant update (name, envelope) on table public.factorlab_saves to authenticated;

create policy factorlab_saves_read_own
  on public.factorlab_saves for select to authenticated
  using ((select auth.uid()) = user_id);

create policy factorlab_saves_insert_own
  on public.factorlab_saves for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy factorlab_saves_update_own
  on public.factorlab_saves for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.factorlab_save_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.slot is distinct from old.slot
     or new.created_at is distinct from old.created_at then
    raise exception 'Save identity and creation time are immutable' using errcode = '22023';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function public.factorlab_save_touch() from public, anon, authenticated, service_role;

create trigger factorlab_save_touch
  before update on public.factorlab_saves
  for each row execute function public.factorlab_save_touch();

commit;
