-- Make callback creation durable and atomic across workers and restarts.
-- The request key is scoped to the authenticated owner.  A stable payload
-- fingerprint lets a retry return the original row while rejecting reuse of
-- the key for a different request.
begin;

alter table public.callbacks
  add column create_request_key uuid,
  add column create_request_hash text;

alter table public.callbacks
  add constraint callbacks_create_request_fields check (
    (create_request_key is null and create_request_hash is null)
    or (create_request_key is not null and create_request_hash is not null)
  );

alter table public.callbacks
  add constraint callbacks_create_request_owner_key_unique
  unique (user_id, create_request_key);

create function public.callbacks_preserve_create_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.create_request_key is distinct from old.create_request_key
    or new.create_request_hash is distinct from old.create_request_hash
  ) then
    raise exception 'Callback create request identity cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.callbacks_preserve_create_request() from public, anon, authenticated;

create trigger callbacks_preserve_create_request
  before update on public.callbacks
  for each row execute function public.callbacks_preserve_create_request();

create function public.create_callback_idempotent(
  p_request_key uuid,
  p_phone_number text,
  p_account_number text,
  p_account_holder_name text,
  p_comments text,
  p_schedule_mode text,
  p_scheduled_at timestamptz,
  p_window_start_at timestamptz,
  p_window_end_at timestamptz
)
returns table(
  callback_id uuid,
  created boolean,
  same_payload boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  payload_hash text := md5(
    jsonb_build_array(
      p_phone_number,
      p_account_number,
      p_account_holder_name,
      p_comments,
      p_schedule_mode,
      case
        when p_scheduled_at is null then null::numeric
        else extract(epoch from p_scheduled_at)
      end,
      case
        when p_window_start_at is null then null::numeric
        else extract(epoch from p_window_start_at)
      end,
      case
        when p_window_end_at is null then null::numeric
        else extract(epoch from p_window_end_at)
      end
    )::text
  );
  inserted_id uuid;
  stored_hash text;
begin
  if owner_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.callbacks (
    user_id,
    phone_number,
    account_number,
    account_holder_name,
    comments,
    schedule_mode,
    scheduled_at,
    window_start_at,
    window_end_at,
    lifecycle_state,
    create_request_key,
    create_request_hash
  ) values (
    owner_id,
    p_phone_number,
    p_account_number,
    p_account_holder_name,
    p_comments,
    p_schedule_mode,
    p_scheduled_at,
    p_window_start_at,
    p_window_end_at,
    'open',
    p_request_key,
    case when p_request_key is null then null else payload_hash end
  )
  on conflict (user_id, create_request_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    return query select inserted_id, true, true;
    return;
  end if;

  -- At READ COMMITTED the conflicting row is visible to this next command,
  -- including when another worker won the unique-key race just before us.
  select c.id, c.create_request_hash
    into callback_id, stored_hash
    from public.callbacks as c
   where c.user_id = owner_id
     and c.create_request_key = p_request_key;

  if callback_id is null then
    raise exception 'Callback idempotency request could not be resolved';
  end if;

  return query select callback_id, false, stored_hash = payload_hash;
end;
$$;

revoke all on function public.create_callback_idempotent(
  uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_callback_idempotent(
  uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz
) to authenticated;

commit;
