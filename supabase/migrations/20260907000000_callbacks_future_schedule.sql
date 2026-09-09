-- Enforce future schedules for open callbacks at the database layer.
-- PostgreSQL CHECK constraints cannot call non-immutable functions like now(),
-- so a BEFORE INSERT OR UPDATE trigger performs the comparison instead.
-- Closed callbacks are exempt: they legitimately retain past schedules.
begin;

create function public.callbacks_enforce_future_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.lifecycle_state = 'open') then
    if (new.schedule_mode = 'exact' and new.scheduled_at <= now()) then
      raise exception 'Scheduled time must be in the future';
    elsif (new.schedule_mode = 'window' and new.window_start_at <= now()) then
      raise exception 'Window start time must be in the future';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.callbacks_enforce_future_schedule() from public, anon, authenticated;

create trigger callbacks_enforce_future_schedule
  before insert or update on public.callbacks
  for each row execute function public.callbacks_enforce_future_schedule();

commit;
