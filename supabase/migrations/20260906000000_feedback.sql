-- User feedback for Scheduler helpfulness (rating 1-4 + free text).
-- Owner-scoped and append-only: users read and insert their own rows only.
begin;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  feedback text not null check (char_length(btrim(feedback)) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

revoke all on table public.feedback from public, anon, authenticated;
grant select, insert on table public.feedback to authenticated;

create policy feedback_select_own on public.feedback
  for select to authenticated using ((select auth.uid()) = user_id);

create policy feedback_insert_own on public.feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);

create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_created_at_idx on public.feedback (created_at desc);

commit;
