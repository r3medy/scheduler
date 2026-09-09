-- Make auth admission completion idempotent for duplicate and out-of-order
-- success, failure, and outage callbacks. The previous aggregate counters
-- could not identify which reservation had completed, so a repeated callback
-- could consume another request's slot or erase its failure.
begin;

create table public.auth_rate_limit_admissions (
  scope text not null check (
    scope in ('login-company', 'login-source', 'registration-source')
  ),
  rate_key text not null check (
    rate_key ~ '^[0-9a-f]{64}$'
  ),
  admission_token bigint not null check (admission_token > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (scope, rate_key, admission_token),
  foreign key (scope, rate_key)
    references public.auth_rate_limits (scope, rate_key)
    on delete cascade
);

alter table public.auth_rate_limit_admissions enable row level security;

revoke all on table public.auth_rate_limit_admissions
  from public, anon, authenticated;
grant all on table public.auth_rate_limit_admissions to service_role;

-- Keep status checks from deleting an expired generation. The application no
-- longer uses status as an admission gate, but an older worker may still call
-- it during a rolling deploy. The next atomic admission owns window rollover
-- and advances the generation before issuing a new token.
create or replace function public.auth_rate_limit_status(
  p_scope text,
  p_key text,
  p_window_seconds integer,
  p_max_attempts integer,
  p_lockout_seconds integer default 0
)
returns table (
  allowed boolean,
  failure_count integer,
  retry_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.auth_rate_limits%rowtype;
begin
  if p_scope is null
    or p_key is null
    or p_window_seconds is null
    or p_max_attempts is null
    or p_lockout_seconds is null
    or p_scope not in ('login-company', 'login-source', 'registration-source')
    or p_key !~ '^[0-9a-f]{64}$'
    or p_window_seconds <= 0
    or p_max_attempts <= 0
    or p_lockout_seconds < 0 then
    raise exception using
      errcode = '22023',
      message = 'Invalid auth rate-limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key, 0));

  select * into current_row
    from public.auth_rate_limits
   where scope = p_scope and rate_key = p_key
   for update;

  if not found or current_row.expires_at <= now() then
    return query select true, 0, null::timestamptz;
    return;
  end if;

  if current_row.locked_until is not null
     and current_row.locked_until > now() then
    return query select
      false, current_row.failure_count, current_row.locked_until;
    return;
  end if;

  if current_row.failure_count + current_row.active_attempts >= p_max_attempts then
    return query select
      false, current_row.failure_count, current_row.expires_at;
    return;
  end if;

  return query select
    true, current_row.failure_count, null::timestamptz;
end;
$$;

create or replace function public.auth_rate_limit_admit(
  p_scope text,
  p_key text,
  p_window_seconds integer,
  p_max_attempts integer,
  p_lockout_seconds integer default 0
)
returns table (
  allowed boolean,
  failure_count integer,
  retry_at timestamptz,
  admission_token bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.auth_rate_limits%rowtype;
  next_version bigint;
begin
  if p_scope is null
    or p_key is null
    or p_window_seconds is null
    or p_max_attempts is null
    or p_lockout_seconds is null
    or p_scope not in ('login-company', 'login-source', 'registration-source')
    or p_key !~ '^[0-9a-f]{64}$'
    or p_window_seconds <= 0
    or p_max_attempts <= 0
    or p_lockout_seconds < 0 then
    raise exception using
      errcode = '22023',
      message = 'Invalid auth rate-limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key, 0));

  select * into current_row
    from public.auth_rate_limits
   where scope = p_scope and rate_key = p_key
   for update;

  if not found or current_row.expires_at <= now() then
    if found then
      -- Keep the monotonically increasing generation on the bucket. A late
      -- completion from the previous window must never match token 1 from a
      -- freshly opened window.
      next_version := current_row.admission_version + 1;
      delete from public.auth_rate_limit_admissions as admissions
       where admissions.scope = p_scope
         and admissions.rate_key = p_key;
      update public.auth_rate_limits
         set window_started_at = now(),
             expires_at = now() + make_interval(secs => p_window_seconds),
             failure_count = 0,
             locked_until = null,
             active_attempts = 1,
             admission_version = next_version,
             updated_at = now()
       where scope = p_scope and rate_key = p_key;
      insert into public.auth_rate_limit_admissions
        (scope, rate_key, admission_token)
      values (p_scope, p_key, next_version);

      return query select true, 0, null::timestamptz, next_version;
      return;
    end if;

    insert into public.auth_rate_limits (
      scope, rate_key, window_started_at, expires_at,
      failure_count, active_attempts, admission_version
    ) values (
      p_scope, p_key, now(), now() + make_interval(secs => p_window_seconds),
      0, 1, 1
    );
    insert into public.auth_rate_limit_admissions
      (scope, rate_key, admission_token)
    values (p_scope, p_key, 1);

    return query select true, 0, null::timestamptz, 1::bigint;
    return;
  end if;

  if current_row.locked_until is not null
     and current_row.locked_until > now() then
    return query select
      false, current_row.failure_count, current_row.locked_until, null::bigint;
    return;
  end if;

  if current_row.failure_count + current_row.active_attempts >= p_max_attempts then
    return query select
      false, current_row.failure_count, current_row.expires_at, null::bigint;
    return;
  end if;

  next_version := current_row.admission_version + 1;
  update public.auth_rate_limits
     set active_attempts = active_attempts + 1,
         admission_version = next_version,
         updated_at = now()
   where scope = p_scope and rate_key = p_key;
  insert into public.auth_rate_limit_admissions
    (scope, rate_key, admission_token)
  values (p_scope, p_key, next_version);

  return query select
    true, current_row.failure_count, null::timestamptz, next_version;
end;
$$;

create or replace function public.auth_rate_limit_record_failure(
  p_scope text,
  p_key text,
  p_window_seconds integer,
  p_max_attempts integer,
  p_lockout_seconds integer,
  p_admission_token bigint
)
returns table (allowed boolean, failure_count integer, retry_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.auth_rate_limits%rowtype;
  next_count integer;
  next_active integer;
  next_locked_until timestamptz;
begin
  if p_scope is null
    or p_key is null
    or p_window_seconds is null
    or p_max_attempts is null
    or p_lockout_seconds is null
    or p_admission_token is null
    or p_scope not in ('login-company', 'login-source', 'registration-source')
    or p_key !~ '^[0-9a-f]{64}$'
    or p_window_seconds <= 0
    or p_max_attempts <= 0
    or p_lockout_seconds < 0 then
    raise exception using
      errcode = '22023',
      message = 'Invalid auth rate-limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key, 0));

  select * into current_row
    from public.auth_rate_limits
   where scope = p_scope and rate_key = p_key
   for update;

  if not found or current_row.expires_at <= now() then
    if found then
      delete from public.auth_rate_limits
       where scope = p_scope and rate_key = p_key;
    end if;
    return query select true, 0, null::timestamptz;
    return;
  end if;

  delete from public.auth_rate_limit_admissions as admissions
   where admissions.scope = p_scope
     and admissions.rate_key = p_key
     and admissions.admission_token = p_admission_token;
  if not found then
    return query select
      current_row.failure_count + current_row.active_attempts < p_max_attempts,
      current_row.failure_count,
      case
        when current_row.locked_until is not null
             and current_row.locked_until > now()
          then current_row.locked_until
        when current_row.failure_count + current_row.active_attempts >= p_max_attempts
          then current_row.expires_at
        else null::timestamptz
      end;
    return;
  end if;

  next_count := current_row.failure_count + 1;
  next_active := greatest(current_row.active_attempts - 1, 0);
  next_locked_until := case
    when p_lockout_seconds > 0 and next_count >= p_max_attempts
      then now() + make_interval(secs => p_lockout_seconds)
    else current_row.locked_until
  end;

  update public.auth_rate_limits
     set failure_count = next_count,
         active_attempts = next_active,
         locked_until = next_locked_until,
         admission_version = admission_version + 1,
         updated_at = now()
   where scope = p_scope and rate_key = p_key;

  return query select
    next_count + next_active < p_max_attempts,
    next_count,
    case
      when next_locked_until is not null and next_locked_until > now()
        then next_locked_until
      when next_count >= p_max_attempts then current_row.expires_at
      else null::timestamptz
    end;
end;
$$;

create or replace function public.auth_rate_limit_reset(
  p_scope text,
  p_key text,
  p_admission_token bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.auth_rate_limits%rowtype;
begin
  if p_scope is null or p_key is null or p_admission_token is null
    or p_scope not in ('login-company', 'login-source', 'registration-source')
    or p_key !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'Invalid auth rate-limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key, 0));
  select * into current_row
    from public.auth_rate_limits
   where scope = p_scope and rate_key = p_key
   for update;

  if not found or current_row.expires_at <= now() then
    if found then
      delete from public.auth_rate_limits
       where scope = p_scope and rate_key = p_key;
    end if;
    return;
  end if;

  delete from public.auth_rate_limit_admissions as admissions
   where admissions.scope = p_scope
     and admissions.rate_key = p_key
     and admissions.admission_token = p_admission_token;
  if not found then return; end if;

  update public.auth_rate_limits
     set active_attempts = greatest(active_attempts - 1, 0),
         admission_version = admission_version + 1,
         updated_at = now()
   where scope = p_scope and rate_key = p_key;
end;
$$;

create or replace function public.auth_rate_limit_release(
  p_scope text,
  p_key text,
  p_admission_token bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.auth_rate_limits%rowtype;
begin
  if p_scope is null or p_key is null or p_admission_token is null
    or p_scope not in ('login-company', 'login-source', 'registration-source')
    or p_key !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'Invalid auth rate-limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key, 0));
  select * into current_row
    from public.auth_rate_limits
   where scope = p_scope and rate_key = p_key
   for update;

  if not found or current_row.expires_at <= now() then
    if found then
      delete from public.auth_rate_limits
       where scope = p_scope and rate_key = p_key;
    end if;
    return;
  end if;

  delete from public.auth_rate_limit_admissions as admissions
   where admissions.scope = p_scope
     and admissions.rate_key = p_key
     and admissions.admission_token = p_admission_token;
  if not found then return; end if;

  update public.auth_rate_limits
     set active_attempts = greatest(active_attempts - 1, 0),
         admission_version = admission_version + 1,
         updated_at = now()
   where scope = p_scope and rate_key = p_key;
end;
$$;

revoke execute on function public.auth_rate_limit_admit(
  text, text, integer, integer, integer
) from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_record_failure(
  text, text, integer, integer, integer, bigint
) from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_reset(
  text, text, bigint
) from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_release(
  text, text, bigint
) from public, anon, authenticated;

grant execute on function public.auth_rate_limit_admit(
  text, text, integer, integer, integer
) to service_role;
grant execute on function public.auth_rate_limit_record_failure(
  text, text, integer, integer, integer, bigint
) to service_role;
grant execute on function public.auth_rate_limit_reset(
  text, text, bigint
) to service_role;
grant execute on function public.auth_rate_limit_release(
  text, text, bigint
) to service_role;

commit;
