begin;

create domain public.callback_attempt_note as text
  constraint callback_attempt_note_max_length
  check (value is null or char_length(value) <= 1000);

comment on domain public.callback_attempt_note is
  'Attempt note text limited to 1000 characters; callback_attempts.note must use this domain.';

alter table public.callbacks
  add constraint callbacks_phone_number_length
    check (char_length(phone_number) <= 64),
  add constraint callbacks_account_number_length
    check (char_length(account_number) <= 64),
  add constraint callbacks_account_holder_name_length
    check (char_length(account_holder_name) <= 120),
  add constraint callbacks_comments_length
    check (comments is null or char_length(comments) <= 2000);

commit;
