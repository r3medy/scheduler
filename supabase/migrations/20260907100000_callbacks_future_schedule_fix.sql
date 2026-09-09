-- Correct the future-schedule trigger without rewriting the already-applied
-- 20260907000000_callbacks_future_schedule migration.
--
-- An open callback can be overdue when its contact metadata is edited.  A
-- future schedule is required only when a row is inserted, when an open row's
-- schedule changes, or when a closed row is reopened.  Closed rows retain
-- their historical schedule and may continue to be edited.
begin;

create or replace function public.callbacks_enforce_future_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  schedule_changed boolean := false;
  must_be_future boolean := false;
begin
  if tg_op = 'INSERT' then
    must_be_future := new.lifecycle_state = 'open';
  elsif new.lifecycle_state = 'open' then
    -- Reopening always creates a new open occurrence, even if the stored
    -- schedule itself was not changed.
    must_be_future := old.lifecycle_state <> 'open';

    if not must_be_future and old.lifecycle_state = 'open' then
      schedule_changed :=
        new.schedule_mode is distinct from old.schedule_mode
        or new.scheduled_at is distinct from old.scheduled_at
        or new.window_start_at is distinct from old.window_start_at
        or new.window_end_at is distinct from old.window_end_at;
      must_be_future := schedule_changed;
    end if;
  end if;

  if must_be_future then
    if new.schedule_mode = 'exact' and new.scheduled_at <= now() then
      raise exception 'Scheduled time must be in the future';
    elsif new.schedule_mode = 'window' and new.window_start_at <= now() then
      raise exception 'Window start time must be in the future';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.callbacks_enforce_future_schedule() from public, anon, authenticated;

commit;
