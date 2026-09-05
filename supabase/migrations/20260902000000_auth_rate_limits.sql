create table if not exists public.auth_rate_limits (
  scope text not null check (
    scope in ('login-company', 'login-source', 'registration-source')
  ),
  rate_key text not null check (
    rate_key ~ '^[0-9a-f]{64}$'
  ),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  failure_count integer not null default 0 check (failure_count >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (scope, rate_key)
);

alter table public.auth_rate_limits enable row level security;

revoke all on table public.auth_rate_limits from public, anon, authenticated;

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

  select *
    into current_row
    from public.auth_rate_limits
   where scope = p_scope
     and rate_key = p_key
   for update;

  if not found or current_row.expires_at <= now() then
    if found then
      delete from public.auth_rate_limits
       where scope = p_scope
         and rate_key = p_key;
    end if;

    return query select true, 0, null::timestamptz;
    return;
  end if;

  if current_row.locked_until is not null
     and current_row.locked_until > now() then
    return query select
      false,
      current_row.failure_count,
      current_row.locked_until;
    return;
  end if;

  if current_row.failure_count >= p_max_attempts then
    return query select
      false,
      current_row.failure_count,
      current_row.expires_at;
    return;
  end if;

  return query select
    true,
    current_row.failure_count,
    null::timestamptz;
end;
$$;

create or replace function public.auth_rate_limit_record_failure(
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
  next_count integer;
  next_locked_until timestamptz;
  next_expires_at timestamptz;
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

  select *
    into current_row
    from public.auth_rate_limits
   where scope = p_scope
     and rate_key = p_key
   for update;

  if not found or current_row.expires_at <= now() then
    if found then
      delete from public.auth_rate_limits
       where scope = p_scope
         and rate_key = p_key;
    end if;

    next_count := 1;
    next_expires_at := now() + make_interval(secs => p_window_seconds);
    next_locked_until := case
      when p_lockout_seconds > 0 and next_count >= p_max_attempts
        then now() + make_interval(secs => p_lockout_seconds)
      else null
    end;

    insert into public.auth_rate_limits (
      scope,
      rate_key,
      window_started_at,
      expires_at,
      failure_count,
      locked_until
    ) values (
      p_scope,
      p_key,
      now(),
      next_expires_at,
      next_count,
      next_locked_until
    );
  else
    next_count := current_row.failure_count + 1;
    next_expires_at := current_row.expires_at;
    next_locked_until := case
      when p_lockout_seconds > 0 and next_count >= p_max_attempts
        then now() + make_interval(secs => p_lockout_seconds)
      else current_row.locked_until
    end;

    update public.auth_rate_limits
       set failure_count = next_count,
           locked_until = next_locked_until,
           updated_at = now()
     where scope = p_scope
       and rate_key = p_key;
  end if;

  return query select
    next_count < p_max_attempts,
    next_count,
    case
      when next_locked_until is not null and next_locked_until > now()
        then next_locked_until
      when next_count >= p_max_attempts
        then next_expires_at
      else null
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
  if p_scope is null
    or p_key is null
    or p_scope not in ('login-company', 'login-source', 'registration-source')
    or p_key !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'Invalid auth rate-limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key, 0));

  delete from public.auth_rate_limits
   where scope = p_scope
     and rate_key = p_key;
end;
$$;

revoke execute on function public.auth_rate_limit_status(text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_record_failure(text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_reset(text, text)
  from public, anon, authenticated;

grant execute on function public.auth_rate_limit_status(text, text, integer, integer, integer)
  to service_role;
grant execute on function public.auth_rate_limit_record_failure(text, text, integer, integer, integer)
  to service_role;
grant execute on function public.auth_rate_limit_reset(text, text)
  to service_role;
