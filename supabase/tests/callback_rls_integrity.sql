-- Disposable owner-isolation verification for callback RLS and the durable
-- create idempotency RPC. Run as a database administrator against an
-- isolated Supabase/Postgres database seeded with two auth.users rows:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/callback_rls_integrity.sql
-- The transaction is rolled back at the end and inserts no durable test data.
begin;

set local timezone = 'UTC';

do $$
declare
  owner_id uuid;
  other_owner_id uuid;
  callback_id uuid;
  retry_id uuid;
  second_retry_id uuid;
  same_payload_result boolean;
  visible_count integer;
  changed_count integer;
  future_at timestamptz := now() + interval '1 hour';
begin
  select first_user.id, second_user.id
    into owner_id, other_owner_id
    from (
      select id, row_number() over (order by created_at, id) as position
        from auth.users
    ) as first_user
    join (
      select id, row_number() over (order by created_at, id) as position
        from auth.users
    ) as second_user
      on second_user.position = 2
   where first_user.position = 1;

  if owner_id is null or other_owner_id is null then
    raise exception 'Seed two disposable auth.users rows before running this harness';
  end if;

  -- The authenticated role sees and can create only its own callback rows.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.callbacks (
    user_id, phone_number, account_number, account_holder_name,
    schedule_mode, scheduled_at, lifecycle_state
  ) values (
    owner_id, '0100000000', 'sql-rls-owner', 'SQL RLS Owner',
    'exact', future_at, 'open'
  ) returning id into callback_id;

  select count(*) into visible_count
    from public.callbacks as callbacks
   where callbacks.id = callback_id;
  if visible_count <> 1 then
    raise exception 'Owner could not read their own callback';
  end if;

  -- A second authenticated identity cannot read, update, or delete it.
  perform set_config('request.jwt.claim.sub', other_owner_id::text, true);
  select count(*) into visible_count
    from public.callbacks as callbacks
   where callbacks.id = callback_id;
  if visible_count <> 0 then
    raise exception 'Second owner read another owner callback';
  end if;

  update public.callbacks
     set comments = 'must stay private'
   where public.callbacks.id = callback_id;
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'Second owner updated another owner callback';
  end if;

  delete from public.callbacks where public.callbacks.id = callback_id;
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'Second owner deleted another owner callback';
  end if;

  -- The durable retry operation is owner-scoped and runs under RLS.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  select result.callback_id into retry_id
    from public.create_callback_idempotent(
      '33333333-3333-4333-8333-333333333333',
      '0123333333', 'sql-rls-idempotent', 'SQL RLS Owner', null,
      'exact', future_at, null, null
    ) as result;
  select result.callback_id, result.same_payload
    into second_retry_id, same_payload_result
    from public.create_callback_idempotent(
      '33333333-3333-4333-8333-333333333333',
      '0123333333', 'sql-rls-idempotent', 'SQL RLS Owner', null,
      'exact', future_at, null, null
    ) as result;
  if retry_id is null or second_retry_id is distinct from retry_id
     or same_payload_result is not true then
    raise exception 'Owner-scoped idempotent retry failed under RLS';
  end if;

  -- The anonymous role has neither table grants nor RPC execution rights.
  perform set_config('role', 'anon', true);
  begin
    select count(*) into visible_count from public.callbacks;
    raise exception 'Anonymous role unexpectedly read callbacks';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
