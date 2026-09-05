export const CALLBACK_FIELD_MAX_LENGTHS = {
  accountHolderName: 120,
  phoneNumber: 64,
  accountNumber: 64,
  comments: 2000,
  attemptNote: 1000,
} as const

export const ACCOUNT_HOLDER_NAME_MAX_LENGTH =
  CALLBACK_FIELD_MAX_LENGTHS.accountHolderName
export const PHONE_NUMBER_MAX_LENGTH = CALLBACK_FIELD_MAX_LENGTHS.phoneNumber
export const ACCOUNT_NUMBER_MAX_LENGTH =
  CALLBACK_FIELD_MAX_LENGTHS.accountNumber
export const COMMENTS_MAX_LENGTH = CALLBACK_FIELD_MAX_LENGTHS.comments
export const ATTEMPT_NOTE_MAX_LENGTH = CALLBACK_FIELD_MAX_LENGTHS.attemptNote
