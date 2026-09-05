begin;

create table public.callback_attempts (
  id uuid primary key default gen_random_uuid(),
  callback_id uuid not null references public.callbacks (id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('voicemail', 'no_answer')),
  note public.callback_attempt_note,
  caused_rescheduling boolean not null,
  prior_schedule_mode text check (prior_schedule_mode in ('exact', 'window')),
  prior_scheduled_at timestamptz,
  prior_window_start_at timestamptz,
  prior_window_end_at timestamptz,
  created_at timestamptz not null default now(),
  constraint callback_attempts_valid_prior_schedule check (
    (
      caused_rescheduling
      and prior_schedule_mode is not null
      and (
        (
          prior_schedule_mode = 'exact'
          and prior_scheduled_at is not null
          and prior_window_start_at is null
          and prior_window_end_at is null
        )
        or
        (
          prior_schedule_mode = 'window'
          and prior_scheduled_at is null
          and prior_window_start_at is not null
          and prior_window_end_at is not null
          and prior_window_end_at > prior_window_start_at
        )
      )
    )
    or
    (
      not caused_rescheduling
      and prior_schedule_mode is null
      and prior_scheduled_at is null
      and prior_window_start_at is null
      and prior_window_end_at is null
    )
  )
);

create index callback_attempts_callback_attempted_at_idx
  on public.callback_attempts (callback_id, attempted_at desc);

alter table public.callback_attempts enable row level security;

revoke all on table public.callback_attempts from public, anon, authenticated;
grant select on table public.callback_attempts to authenticated;

create policy callback_attempts_select_own on public.callback_attempts
  for select to authenticated
  using (
    exists (
      select 1
      from public.callbacks
      where callbacks.id = callback_attempts.callback_id
        and callbacks.user_id = (select auth.uid())
    )
  );

-- Kept as defense in depth if direct insert is ever granted. Normal application
-- writes use record_callback_attempt so the attempt and parent update are atomic.
create policy callback_attempts_insert_own on public.callback_attempts
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.callbacks
      where callbacks.id = callback_attempts.callback_id
        and callbacks.user_id = (select auth.uid())
    )
  );

create function public.record_callback_attempt(
  p_callback_id uuid,
  p_outcome text,
  p_note public.callback_attempt_note,
  p_action text,
  p_schedule_mode text,
  p_scheduled_at timestamptz,
  p_window_start_at timestamptz,
  p_window_end_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_callback public.callbacks%rowtype;
  v_note public.callback_attempt_note;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_callback_id is null
    or p_outcome is null
    or p_outcome not in ('voicemail', 'no_answer')
    or p_action is null
    or p_action not in ('close', 'reschedule') then
    raise exception using errcode = '22023', message = 'Invalid callback attempt';
  end if;

  v_note := nullif(btrim(p_note::text), '')::public.callback_attempt_note;

  select callbacks.*
    into v_callback
    from public.callbacks
    where callbacks.id = p_callback_id
      and callbacks.user_id = v_user_id
      and callbacks.lifecycle_state = 'open'
    for update;

  if not found then
    raise exception using errcode = '42501', message = 'Callback unavailable';
  end if;

  if p_action = 'close' then
    if p_schedule_mode is not null
      or p_scheduled_at is not null
      or p_window_start_at is not null
      or p_window_end_at is not null then
      raise exception using errcode = '22023', message = 'Close does not accept a schedule';
    end if;

    insert into public.callback_attempts (
      callback_id,
      outcome,
      note,
      caused_rescheduling
    ) values (
      v_callback.id,
      p_outcome,
      v_note,
      false
    );

    update public.callbacks
      set lifecycle_state = 'closed',
          resolution_outcome = p_outcome,
          closed_at = now()
      where id = v_callback.id;
  else
    if not coalesce((
      (
        p_schedule_mode = 'exact'
        and p_scheduled_at is not null
        and p_scheduled_at > now()
        and p_window_start_at is null
        and p_window_end_at is null
      )
      or
      (
        p_schedule_mode = 'window'
        and p_scheduled_at is null
        and p_window_start_at is not null
        and p_window_start_at > now()
        and p_window_end_at is not null
        and p_window_end_at > p_window_start_at
      )
    ), false) then
      raise exception using errcode = '22023', message = 'Invalid future schedule';
    end if;

    insert into public.callback_attempts (
      callback_id,
      outcome,
      note,
      caused_rescheduling,
      prior_schedule_mode,
      prior_scheduled_at,
      prior_window_start_at,
      prior_window_end_at
    ) values (
      v_callback.id,
      p_outcome,
      v_note,
      true,
      v_callback.schedule_mode,
      v_callback.scheduled_at,
      v_callback.window_start_at,
      v_callback.window_end_at
    );

    update public.callbacks
      set schedule_mode = p_schedule_mode,
          scheduled_at = p_scheduled_at,
          window_start_at = p_window_start_at,
          window_end_at = p_window_end_at,
          lifecycle_state = 'open',
          resolution_outcome = null,
          closed_at = null
      where id = v_callback.id;
  end if;

  return v_callback.id;
end;
$$;

revoke all on function public.record_callback_attempt(
  uuid,
  text,
  public.callback_attempt_note,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.record_callback_attempt(
  uuid,
  text,
  public.callback_attempt_note,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated;

commit;
