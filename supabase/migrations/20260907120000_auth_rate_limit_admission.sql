-- Atomically reserve auth verification capacity before calling Supabase Auth.
-- The existing failure counter remains the user-visible failed-attempt count;
-- active_attempts tracks in-flight verifications so concurrent requests cannot
-- all pass a read-only status check. admission_version makes success cleanup
-- conditional, so an older successful request cannot erase newer failures.
begin;

alter table public.auth_rate_limits
  add column active_attempts integer not null default 0,
  add column admission_version bigint not null default 0;

alter table public.auth_rate_limits
  add constraint auth_rate_limits_active_attempts_nonnegative
    check (active_attempts >= 0),
  add constraint auth_rate_limits_admission_version_nonnegative
    check (admission_version >= 0);

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
    if found then
      delete from public.auth_rate_limits
       where scope = p_scope and rate_key = p_key;
    end if;
    return query select true, 0, null::timestamptz;
    return;
  end if;

  if current_row.locked_until is not null
     and current_row.locked_until > now() then
    return query select false, current_row.failure_count, current_row.locked_until;
    return;
  end if;

  if current_row.failure_count + current_row.active_attempts >= p_max_attempts then
    return query select false, current_row.failure_count, current_row.expires_at;
    return;
  end if;

  return query select true, current_row.failure_count, null::timestamptz;
end;
$$;

create function public.auth_rate_limit_admit(
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
      delete from public.auth_rate_limits
       where scope = p_scope and rate_key = p_key;
    end if;

    insert into public.auth_rate_limits (
      scope, rate_key, window_started_at, expires_at,
      failure_count, active_attempts, admission_version
    ) values (
      p_scope, p_key, now(), now() + make_interval(secs => p_window_seconds),
      0, 1, 1
    );

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

  return query select
    true, current_row.failure_count, null::timestamptz, next_version;
end;
$$;

-- Keep the old five-argument entry point fail-closed. Application callers must
-- provide the admission token returned by auth_rate_limit_admit.
create or replace function public.auth_rate_limit_record_failure(
  p_scope text,
  p_key text,
  p_window_seconds integer,
  p_max_attempts integer,
  p_lockout_seconds integer default 0
)
returns table (allowed boolean, failure_count integer, retry_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception using
    errcode = '22023',
    message = 'An auth admission token is required';
end;
$$;

create function public.auth_rate_limit_record_failure(
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

  if current_row.active_attempts <= 0 then
    return query select
      current_row.failure_count < p_max_attempts,
      current_row.failure_count,
      case when current_row.failure_count >= p_max_attempts
        then current_row.expires_at else null::timestamptz end;
    return;
  end if;

  next_count := current_row.failure_count + 1;
  next_active := current_row.active_attempts - 1;
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
  p_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception using
    errcode = '22023',
    message = 'An auth admission token is required';
end;
$$;

create function public.auth_rate_limit_reset(
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

  if current_row.active_attempts = 1
     and current_row.admission_version = p_admission_token then
    delete from public.auth_rate_limits
     where scope = p_scope and rate_key = p_key;
  else
    update public.auth_rate_limits
       set active_attempts = greatest(active_attempts - 1, 0),
           admission_version = admission_version + 1,
           updated_at = now()
     where scope = p_scope and rate_key = p_key;
    delete from public.auth_rate_limits
     where scope = p_scope and rate_key = p_key
       and active_attempts = 0 and failure_count = 0;
  end if;
end;
$$;

create function public.auth_rate_limit_release(
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

  update public.auth_rate_limits
     set active_attempts = greatest(active_attempts - 1, 0),
         admission_version = admission_version + 1,
         updated_at = now()
   where scope = p_scope and rate_key = p_key;
  delete from public.auth_rate_limits
   where scope = p_scope and rate_key = p_key
     and active_attempts = 0 and failure_count = 0;
end;
$$;

revoke execute on function public.auth_rate_limit_admit(text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_record_failure(text, text, integer, integer, integer, bigint)
  from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_reset(text, text, bigint)
  from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_release(text, text, bigint)
  from public, anon, authenticated;

grant execute on function public.auth_rate_limit_admit(text, text, integer, integer, integer)
  to service_role;
grant execute on function public.auth_rate_limit_record_failure(text, text, integer, integer, integer, bigint)
  to service_role;
grant execute on function public.auth_rate_limit_reset(text, text, bigint)
  to service_role;
grant execute on function public.auth_rate_limit_release(text, text, bigint)
  to service_role;

commit;
