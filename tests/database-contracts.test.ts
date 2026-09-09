import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8")

describe("callback database safety migrations", () => {
  it("keeps the original future-schedule migration immutable", () => {
    expect(migration("20260907000000_callbacks_future_schedule.sql")).toMatch(
      /for each row execute function public\.callbacks_enforce_future_schedule/i
    )
  })

  it("allows unchanged overdue metadata edits but guards new open occurrences", () => {
    const sql = migration("20260907100000_callbacks_future_schedule_fix.sql")

    expect(sql).toMatch(
      /create or replace function public\.callbacks_enforce_future_schedule/i
    )
    expect(sql).toMatch(/tg_op = 'INSERT'/i)
    expect(sql).toMatch(/old\.lifecycle_state <> 'open'/i)
    expect(sql).toMatch(/is distinct from old\.schedule_mode/i)
    expect(sql).toMatch(/new\.scheduled_at <= now\(\)/i)
    expect(sql).toMatch(/new\.window_start_at <= now\(\)/i)
  })

  it("uses an owner-scoped unique key and one atomic retry operation", () => {
    const sql = migration("20260907110000_callback_create_idempotency.sql")

    expect(sql).toMatch(/unique \(user_id, create_request_key\)/i)
    expect(sql).toMatch(
      /on conflict \(user_id, create_request_key\) do nothing/i
    )
    expect(sql).toMatch(/create_request_hash/i)
    expect(sql).toMatch(/stored_hash = payload_hash/i)
    expect(sql).toMatch(/returns table\([\s\S]*same_payload boolean/i)
    expect(sql).toMatch(
      /grant execute on function public\.create_callback_idempotent/i
    )
  })

  it("adds atomic auth admission and conditional success cleanup", () => {
    const sql = migration("20260907120000_auth_rate_limit_admission.sql")

    expect(sql).toMatch(/add column active_attempts integer/i)
    expect(sql).toMatch(/add column admission_version bigint/i)
    expect(sql).toMatch(/create function public\.auth_rate_limit_admit/i)
    expect(sql).toMatch(/pg_advisory_xact_lock/i)
    expect(sql).toMatch(
      /failure_count \+ current_row\.active_attempts >= p_max_attempts/i
    )
    expect(sql).toMatch(/current_row\.admission_version = p_admission_token/i)
    expect(sql).toMatch(/create function public\.auth_rate_limit_release/i)
    expect(sql).toMatch(/An auth admission token is required/i)
  })

  it("makes each auth admission completion token one-shot", () => {
    const sql = migration(
      "20260908000000_auth_rate_limit_admission_tokens.sql"
    )

    expect(sql).toMatch(/create table public\.auth_rate_limit_admissions/i)
    expect(sql).toMatch(/primary key \(scope, rate_key, admission_token\)/i)
    expect(sql).toMatch(
      /delete from public\.auth_rate_limit_admissions as admissions/i
    )
    expect(sql).toMatch(/if not found then return;/i)
    expect(sql).toMatch(/on delete cascade/i)
    expect(sql).toMatch(/next_version := current_row\.admission_version \+ 1/i)
    expect(sql).toMatch(/window_started_at = now\(\)/i)
  })
})
