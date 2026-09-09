-- Disposable Supabase/Postgres verification for atomic auth admission.
-- Run only against a disposable database after applying all migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/auth_rate_limit_integrity.sql
-- The transaction is rolled back at the end and uses service_role-only RPCs.
begin;

do $$
declare
  key text := repeat('a', 64);
  second_key text := repeat('b', 64);
  completion_key text := repeat('c', 64);
  generation_key text := repeat('d', 64);
  allowed boolean;
  failure_count integer;
  active_attempts_result integer;
  token_a bigint;
  token_b bigint;
  token_c bigint;
  token_d bigint;
  token_e bigint;
  token_f bigint;
  token_g bigint;
  retry_at timestamptz;
begin
  delete from public.auth_rate_limits
   where (scope = 'login-company' and rate_key in
     (key, second_key, completion_key));

  -- Two concurrent capacity reservations are admitted; a third is blocked
  -- before any Auth verification could be started.
  select a.allowed, a.admission_token into allowed, token_a
    from public.auth_rate_limit_admit('login-company', key, 900, 2, 900) as a;
  if allowed is not true or token_a is null then
    raise exception 'First admission was unexpectedly blocked';
  end if;

  select a.allowed, a.admission_token into allowed, token_b
    from public.auth_rate_limit_admit('login-company', key, 900, 2, 900) as a;
  if allowed is not true or token_b is null then
    raise exception 'Second admission was unexpectedly blocked';
  end if;

  select a.allowed, a.retry_at into allowed, retry_at
    from public.auth_rate_limit_admit('login-company', key, 900, 2, 900) as a;
  if allowed is not false or retry_at is null then
    raise exception 'Admission capacity did not block the third request';
  end if;

  select limits.active_attempts into active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = key;
  if active_attempts_result <> 2 then
    raise exception 'Expected two active admissions, got %', active_attempts_result;
  end if;

  -- A service outage releases capacity without creating a failed attempt.
  perform public.auth_rate_limit_release('login-company', key, token_a);
  select a.allowed, a.admission_token into allowed, token_c
    from public.auth_rate_limit_admit('login-company', key, 900, 2, 900) as a;
  if allowed is not true or token_c is null then
    raise exception 'Released capacity was not reusable';
  end if;

  -- A failure racing with a success must survive the success cleanup.
  perform public.auth_rate_limit_record_failure(
    'login-company', key, 900, 2, 900, token_b
  );
  perform public.auth_rate_limit_reset('login-company', key, token_c);
  select limits.failure_count, limits.active_attempts
    into failure_count, active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = key;
  if failure_count <> 1 or active_attempts_result <> 0 then
    raise exception
      'Newer failure was erased by success cleanup (failures %, active %)',
      failure_count, active_attempts_result;
  end if;

  -- Completion tokens are one-shot and may arrive out of order. A newer
  -- success must not erase an older in-flight failure, and duplicate
  -- completion callbacks must not consume another request's reservation.
  select a.admission_token into token_d
    from public.auth_rate_limit_admit('login-company', completion_key, 900, 5, 900) as a;
  select a.admission_token into token_e
    from public.auth_rate_limit_admit('login-company', completion_key, 900, 5, 900) as a;
  perform public.auth_rate_limit_reset('login-company', completion_key, token_e);
  select limits.active_attempts into active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = completion_key;
  if active_attempts_result <> 1 then
    raise exception 'Out-of-order success consumed the older admission';
  end if;

  perform public.auth_rate_limit_record_failure(
    'login-company', completion_key, 900, 5, 900, token_d
  );
  perform public.auth_rate_limit_record_failure(
    'login-company', completion_key, 900, 5, 900, token_d
  );
  select limits.failure_count, limits.active_attempts
    into failure_count, active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = completion_key;
  if failure_count <> 1 or active_attempts_result <> 0 then
    raise exception
      'Duplicate/out-of-order failure corrupted counters (failures %, active %)',
      failure_count, active_attempts_result;
  end if;

  -- A duplicate success after the failure is a no-op, rather than a second
  -- decrement that could hide another reservation.
  perform public.auth_rate_limit_reset('login-company', completion_key, token_e);
  select limits.failure_count, limits.active_attempts
    into failure_count, active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = completion_key;
  if failure_count <> 1 or active_attempts_result <> 0 then
    raise exception 'Duplicate success changed a completed reservation';
  end if;

  delete from public.auth_rate_limits
   where scope = 'login-company' and rate_key = completion_key;

  -- Outage release is also one-shot; a duplicate release must not consume
  -- the other request's active slot.
  select a.admission_token into token_d
    from public.auth_rate_limit_admit('login-company', second_key, 900, 5, 900) as a;
  select a.admission_token into token_e
    from public.auth_rate_limit_admit('login-company', second_key, 900, 5, 900) as a;
  perform public.auth_rate_limit_release('login-company', second_key, token_d);
  perform public.auth_rate_limit_release('login-company', second_key, token_d);
  select limits.active_attempts into active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = second_key;
  if active_attempts_result <> 1 then
    raise exception 'Duplicate release consumed another active admission';
  end if;
  perform public.auth_rate_limit_record_failure(
    'login-company', second_key, 900, 5, 900, token_e
  );
  delete from public.auth_rate_limits
   where scope = 'login-company' and rate_key = second_key;

  -- Token generations remain unique after an empty bucket is reused and
  -- after its window rolls over. A late completion from either prior
  -- generation must not consume the new request's reservation.
  select a.admission_token into token_f
    from public.auth_rate_limit_admit('login-company', generation_key, 900, 5, 900) as a;
  perform public.auth_rate_limit_reset('login-company', generation_key, token_f);
  select a.admission_token into token_g
    from public.auth_rate_limit_admit('login-company', generation_key, 900, 5, 900) as a;
  if token_g = token_f then
    raise exception 'Admission token was reused after success cleanup';
  end if;
  perform public.auth_rate_limit_reset('login-company', generation_key, token_f);
  select limits.active_attempts into active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = generation_key;
  if active_attempts_result <> 1 then
    raise exception 'Late completion consumed a newer admission';
  end if;

  update public.auth_rate_limits
     set expires_at = now() - interval '1 second'
   where scope = 'login-company' and rate_key = generation_key;
  select a.allowed into allowed
    from public.auth_rate_limit_status('login-company', generation_key, 900, 5, 900) as a;
  if allowed is not true then
    raise exception 'Expired status check unexpectedly blocked admission';
  end if;
  select a.admission_token into token_f
    from public.auth_rate_limit_admit('login-company', generation_key, 900, 5, 900) as a;
  if token_f = token_g then
    raise exception 'Admission token was reused after window rollover';
  end if;
  perform public.auth_rate_limit_reset('login-company', generation_key, token_g);
  select limits.active_attempts into active_attempts_result
    from public.auth_rate_limits as limits
   where scope = 'login-company' and rate_key = generation_key;
  if active_attempts_result <> 1 then
    raise exception 'Expired-generation completion consumed a newer admission';
  end if;
  perform public.auth_rate_limit_reset('login-company', generation_key, token_f);

  delete from public.auth_rate_limits
   where scope = 'login-company' and rate_key = key;
  delete from public.auth_rate_limits
   where scope = 'login-company' and rate_key = generation_key;
end;
$$;

rollback;
