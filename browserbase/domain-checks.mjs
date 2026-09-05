import assert from "node:assert/strict"
import { writeFile, mkdir } from "node:fs/promises"
import { deriveTemporalState } from "../lib/calendar/date-utils.ts"

const minute = 60_000
const start = "2030-01-02T12:00:00.000Z"
const end = "2030-01-02T13:30:00.000Z"
const base = Date.parse(start)
const cases = [
  ["exact", -1, "upcoming"], ["exact", 0, "due"],
  ["exact", 5 * minute - 1, "due"], ["exact", 5 * minute, "overdue"],
  ["window", -1, "upcoming"], ["window", 0, "due"],
  ["window", 5 * minute, "due"], ["window", 90 * minute, "due"],
  ["window", 90 * minute + 1, "grace"],
  ["window", 95 * minute - 1, "grace"], ["window", 95 * minute, "overdue"],
]
const results = cases.map(([mode, offset, expected]) => {
  const actual = deriveTemporalState(mode, start, mode === "window" ? end : null, new Date(base + offset))
  assert.equal(actual, expected, `${mode} at offset ${offset}`)
  return { mode, offsetMilliseconds: offset, expected, actual, status: "PASS" }
})
await mkdir("artifacts", { recursive: true })
await writeFile("artifacts/domain-checks.json", JSON.stringify(results, null, 2))
console.log(`${results.length} schedule boundary checks passed. This verifies the pure calculation, not automatic UI updates or notifications.`)
