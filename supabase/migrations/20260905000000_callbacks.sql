-- Calendar storage matching the callback model in PRODUCT.md section 15.1.
-- Create the table and its ownership policies together, before exposing data.
begin;

create table public.callbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_number text not null check (length(btrim(phone_number)) > 0),
  account_number text not null check (length(btrim(account_number)) > 0),
  account_holder_name text not null check (length(btrim(account_holder_name)) > 0),
  comments text,
  schedule_mode text not null check (schedule_mode in ('exact', 'window')),
  scheduled_at timestamptz,
  window_start_at timestamptz,
  window_end_at timestamptz,
  lifecycle_state text not null default 'open'
    check (lifecycle_state in ('open', 'closed')),
  resolution_outcome text
    check (resolution_outcome in ('reached', 'voicemail', 'no_answer')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint callbacks_valid_schedule check (
    (schedule_mode = 'exact' and scheduled_at is not null
      and window_start_at is null and window_end_at is null)
    or
    (schedule_mode = 'window' and scheduled_at is null
      and window_start_at is not null and window_end_at is not null
      and window_end_at > window_start_at)
  ),
  constraint callbacks_valid_resolution check (
    (lifecycle_state = 'open' and resolution_outcome is null and closed_at is null)
    or
    (lifecycle_state = 'closed' and resolution_outcome is not null and closed_at is not null)
  )
);

alter table public.callbacks enable row level security;

revoke all on table public.callbacks from public, anon, authenticated;
grant select, insert, update, delete on table public.callbacks to authenticated;

create policy callbacks_select_own on public.callbacks
  for select to authenticated using ((select auth.uid()) = user_id);

create policy callbacks_insert_own on public.callbacks
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy callbacks_update_own on public.callbacks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy callbacks_delete_own on public.callbacks
  for delete to authenticated using ((select auth.uid()) = user_id);

create index callbacks_user_id_idx on public.callbacks (user_id);
create index callbacks_open_exact_idx on public.callbacks (user_id, scheduled_at)
  where lifecycle_state = 'open' and schedule_mode = 'exact';
create index callbacks_open_window_idx on public.callbacks (user_id, window_start_at)
  where lifecycle_state = 'open' and schedule_mode = 'window';

create function public.set_callback_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_callback_updated_at() from public, anon, authenticated;

create trigger callbacks_set_updated_at
  before update on public.callbacks
  for each row execute function public.set_callback_updated_at();

commit;
