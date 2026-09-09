-- Disposable Supabase/Postgres verification for the callback migrations.
-- Run only against a disposable database after applying all migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/callback_integrity.sql
-- The transaction is rolled back at the end. The script expects at least one
-- disposable auth.users row so the callbacks foreign key and auth.uid() can
-- be exercised without weakening ownership constraints.
begin;

set local timezone = 'UTC';

do $$
declare
  owner_id uuid;
  future_at timestamptz := now() + interval '1 hour';
  past_at timestamptz := now() - interval '1 hour';
  open_id uuid;
  closed_id uuid;
  retry_id uuid;
  second_retry_id uuid;
  same_payload_result boolean;
  row_count integer;
begin
  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is null then
    raise exception 'Seed one disposable auth.users row before running this harness';
  end if;

  -- Closed history may retain a past schedule and remain editable.
  insert into public.callbacks (
    user_id, phone_number, account_number, account_holder_name,
    schedule_mode, scheduled_at, lifecycle_state, resolution_outcome, closed_at
  ) values (
    owner_id, '0100000000', 'sql-closed', 'SQL Test',
    'exact', past_at, 'closed', 'reached', now()
  ) returning id into closed_id;
  update public.callbacks set comments = 'closed metadata edit' where id = closed_id;

  -- Build an overdue open row only for this disposable trigger test. The
  -- production path cannot create one because the insert trigger is active.
  insert into public.callbacks (
    user_id, phone_number, account_number, account_holder_name,
    schedule_mode, scheduled_at, lifecycle_state
  ) values (
    owner_id, '0111111111', 'sql-open', 'SQL Test',
    'exact', future_at, 'open'
  ) returning id into open_id;
  alter table public.callbacks disable trigger callbacks_enforce_future_schedule;
  update public.callbacks set scheduled_at = past_at where id = open_id;
  alter table public.callbacks enable trigger callbacks_enforce_future_schedule;

  -- Unchanged schedule metadata edits are allowed on an overdue open row.
  update public.callbacks set comments = 'overdue metadata edit' where id = open_id;

  -- Changing an open schedule to the past is still rejected.
  begin
    update public.callbacks set scheduled_at = past_at - interval '1 minute'
      where id = open_id;
    raise exception 'Expected a past open schedule change to be rejected';
  exception when raise_exception then
    if sqlerrm = 'Expected a past open schedule change to be rejected' then
      raise;
    end if;
  end;

  -- Reopening a closed past callback is a new occurrence and is rejected.
  begin
    update public.callbacks
       set lifecycle_state = 'open', resolution_outcome = null, closed_at = null
     where id = closed_id;
    raise exception 'Expected reopening a past callback to be rejected';
  exception when raise_exception then
    if sqlerrm = 'Expected reopening a past callback to be rejected' then
      raise;
    end if;
  end;

  -- Set the JWT claim used by auth.uid() for the owner-scoped idempotency RPC.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  select callback_id into retry_id
    from public.create_callback_idempotent(
      '22222222-2222-4222-8222-222222222222',
      '0122222222', 'sql-idempotent', 'SQL Test', null, 'exact',
      future_at, null, null
    );
  select callback_id, result.same_payload
    into second_retry_id, same_payload_result
    from public.create_callback_idempotent(
      '22222222-2222-4222-8222-222222222222',
      '0122222222', 'sql-idempotent', 'SQL Test', null, 'exact',
      future_at, null, null
    ) as result;
  if retry_id is null or second_retry_id is distinct from retry_id
     or same_payload_result is not true then
    raise exception 'Same-key retry did not return the original callback';
  end if;

  select result.same_payload into same_payload_result
    from public.create_callback_idempotent(
      '22222222-2222-4222-8222-222222222222',
      '0122222222', 'different-payload', 'SQL Test', null, 'exact',
      future_at, null, null
    ) as result;
  if same_payload_result is not false then
    raise exception 'Same-key different-payload retry was not rejected';
  end if;

  select count(*) into row_count
    from public.callbacks
   where user_id = owner_id
     and create_request_key = '22222222-2222-4222-8222-222222222222';
  if row_count <> 1 then
    raise exception 'Idempotency key produced % callback rows', row_count;
  end if;
end;
$$;

rollback;
