import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905010000_callback_field_lengths.sql"
  ),
  "utf8"
)

describe("callback field-length migration", () => {
  it.each([
    "callbacks_phone_number_length",
    "callbacks_account_number_length",
    "callbacks_account_holder_name_length",
    "callbacks_comments_length",
  ])("adds %s without validating legacy rows during release", (constraint) => {
    expect(migration).toMatch(
      new RegExp(
        `add constraint ${constraint}\\s+check \\([\\s\\S]*?\\)\\s+not valid`,
        "i"
      )
    )
  })

  it("keeps the callback attempt note domain as the Task 2 schema contract", () => {
    expect(migration).toMatch(
      /create domain public\.callback_attempt_note as text/i
    )
    expect(migration).toMatch(
      /callback_attempts\.note must use public\.callback_attempt_note/i
    )
    expect(migration).not.toMatch(/create table public\.callback_attempts/i)
  })

  it("documents detection and explicit validation after operator cleanup", () => {
    expect(migration).toMatch(/select id[\s\S]*from public\.callbacks/i)
    expect(migration).toMatch(
      /alter table public\.callbacks validate constraint callbacks_phone_number_length/i
    )
    expect(migration).toMatch(/do not truncate/i)
  })
})
