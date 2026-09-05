begin;

create domain public.callback_attempt_note as text
  constraint callback_attempt_note_max_length
  check (value is null or char_length(value) <= 1000);

comment on domain public.callback_attempt_note is
  'Task 2 schema contract: callback_attempts.note must use public.callback_attempt_note.';

-- NOT VALID avoids scanning or rejecting legacy rows during this release. PostgreSQL
-- still enforces each constraint for every future insert and update.
alter table public.callbacks
  add constraint callbacks_phone_number_length
    check (char_length(phone_number) <= 64) not valid,
  add constraint callbacks_account_number_length
    check (char_length(account_number) <= 64) not valid,
  add constraint callbacks_account_holder_name_length
    check (char_length(account_holder_name) <= 120) not valid,
  add constraint callbacks_comments_length
    check (comments is null or char_length(comments) <= 2000) not valid;

commit;

-- Upgrade follow-up (run separately from this release migration):
-- 1. Locate every legacy violation. Review and correct the source values; do not truncate
--    customer data automatically.
--
-- select id, phone_number, account_number, account_holder_name, comments
-- from public.callbacks
-- where char_length(phone_number) > 64
--    or char_length(account_number) > 64
--    or char_length(account_holder_name) > 120
--    or char_length(comments) > 2000;
--
-- 2. After the query returns no rows, validate each constraint. Validation scans
--    existing rows without repeating the release-time ACCESS EXCLUSIVE lock.
--
-- alter table public.callbacks validate constraint callbacks_phone_number_length;
-- alter table public.callbacks validate constraint callbacks_account_number_length;
-- alter table public.callbacks validate constraint callbacks_account_holder_name_length;
-- alter table public.callbacks validate constraint callbacks_comments_length;
