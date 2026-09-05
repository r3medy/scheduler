import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { createSession } from "./session.ts"

const runId = new Date().toISOString().replaceAll(/[:.]/g, "-")
const output = `artifacts/${runId}`
await mkdir(output, { recursive: true })
const results: { id: string; requirements: string; status: string; evidence: string; screenshot?: string }[] = []
const session = await createSession()
const { userPage: page, browser, bridge, stagehand } = session
const toolingIssues: string[] = []
const companyId = `E${randomInt(10000, 100000)}`
let pin = String(randomInt(100000, 1000000))
const newPin = String(randomInt(100000, 1000000))
const scheduleBase = Date.now()
let registered = false
const names = { exact: `QA Exact ${runId}`, window: `QA Window ${runId}`, conflict: `QA Conflict ${runId}`, voicemail: `QA Voicemail ${runId}`, noanswer: `QA NoAnswer ${runId}` }
const account = `9900${randomInt(10000000, 100000000)}`
const text = () => page.evaluate(() => document.body.innerText)
const check = async (condition: () => Promise<boolean>, message: string, timeout = 20_000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { if (await condition()) return } catch { /* Navigation can replace the document. */ }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(message)
}
const has = (value: string) => check(async () => (await text()).includes(value), `Expected visible text: ${value}`)
async function click(label: string, scope = "") {
  // Resolve from the currently visible DOM, then dispatch a real browser click.
  const selector = await page.evaluate(({ label, scope }) => {
    const root = scope ? document.querySelector(scope) : document
    const nodes = [...(root?.querySelectorAll("button,a") ?? [])].filter((el) => el.getClientRects().length > 0)
    const matches = nodes.filter((el) => el.getAttribute("aria-label") === label || el.textContent?.trim() === label)
    if (matches.length !== 1) return null
    const el = matches[0]
    const marker = `qa-${Math.random().toString(36).slice(2)}`
    el.setAttribute("data-qa-click", marker)
    return `[data-qa-click="${marker}"]`
  }, { label, scope })
  assert(selector, `Expected one visible control named ${label}`)
  await page.locator(selector).click()
}
async function fill(selector: string, value: string) { await page.locator(selector).fill(value) }
async function goto(path: string) {
  try { await page.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded" }) }
  catch (error) { if (!(error instanceof Error) || !error.message.includes("extension world not ready")) throw error }
  await check(async () => await page.evaluate(() => document.readyState !== "loading" && document.body.innerText.length > 30), "Page did not become ready", 30_000)
}
async function saveReport() {
  const report = { runId, session: `https://www.browserbase.com/sessions/${browser.sessionId}`, companyId, results, toolingIssues, bridgeErrors: bridge.errors, httpErrors: bridge.responses.filter((r) => r.status >= 400), limitations: ["Stagehand launches the browser and captures snapshots; Playwright Core performs deterministic user interactions on that same browser because V4 locators fail in the hosted extension.", "HTTP bridge buffers responses; HMR WebSockets and real network latency are not tested.", "Cloud Chromium cannot certify native Windows notification display.", "No production-readiness claim is made for unverified criteria."] }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await writeFile(`${output}/report.md`, `# Browserbase user-journey results\n\nRun: ${runId}\n\nSession: ${report.session}\n\n| Check | PRODUCT.md | Result | Evidence |\n|---|---|---|---|\n${results.map((r) => `| ${r.id} | ${r.requirements} | ${r.status} | ${r.evidence.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ")} |`).join("\n")}\n\n## Limits\n\n${report.limitations.map((s) => `- ${s}`).join("\n")}\n`)
}
async function test(id: string, requirements: string, action: () => Promise<string | void>) {
  console.log(`RUN ${id}`)
  let status = "PASS", evidence = "Observed expected behavior."
  try { evidence = (await action()) || evidence } catch (error) { status = "FAIL"; evidence = error instanceof Error ? error.message : String(error) }
  let screenshot: string | undefined
  try {
    screenshot = `${id}.png`
    await writeFile(`${output}/${screenshot}`, await page.screenshot({ fullPage: true }))
    await writeFile(`${output}/${id}.txt`, await page.locator('body').innerText())
  } catch { screenshot = undefined }
  results.push({ id, requirements, status, evidence, screenshot })
  console.log(`${status} ${id}: ${evidence}`)
  await saveReport()
}
async function dismiss() {
  for (let index = 0; index < 3; index++) {
    if (!(await page.locator('[role="dialog"], [role="alertdialog"]').count())) break
    await page.keyboard.press("Escape")
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
}
async function schedule(field: string, offset: number) {
  const value = await page.evaluate(({ offset, scheduleBase }) => {
    const date = new Date(scheduleBase + offset * 60000)
    return { date: date.toLocaleDateString(), time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` }
  }, { offset, scheduleBase })
  const button = page.locator(`#new-${field}`)
  await button.click()
  const day = page.locator(`#new-${field}-calendar [data-day="${value.date}"] button`)
  if (await day.count()) await day.click()
  else {
    // react-day-picker marks the button itself in the current shadcn implementation.
    const other = page.locator(`#new-${field}-calendar button[data-day="${value.date}"]`)
    if (await other.count()) await other.click()
    else throw new Error(`Cannot find the current date in ${field} calendar`)
  }
  const label = field === "scheduled_at" ? "Date and time" : field === "window_start_at" ? "Window start" : "Window end"
  await fill(`input[aria-label="${label} time"]`, value.time)
  return value
}
async function openNew(name: string, mode: "exact" | "window" = "exact", offset = 60) {
  await dismiss()
  await click("New Callback")
  await fill('#new-phone_number', "2025550147")
  await fill('#new-account_number', account)
  await fill('#new-account_holder_name', name)
  if (mode === "window") {
    await click("Time window")
    await schedule("window_start_at", offset)
    await schedule("window_end_at", offset + 30)
  } else await schedule("scheduled_at", offset)
}
async function saveCallback(allowConflict = false) {
  await click("Save callback")
  await check(async () => !(await page.locator('#new-phone_number').count()) || /overlap|conflict|already scheduled/i.test(await text()), "Callback did not save or show a conflict warning")
  if (await page.locator('#new-phone_number').count()) {
    assert(allowConflict, "Unexpected schedule conflict")
    await click("Save callback")
    await check(async () => !(await page.locator('#new-phone_number').count()), "Conflict acknowledgement did not save")
  }
  await has("Callback saved.")
}
async function openDetails(name: string) {
  await dismiss()
  const selector = await page.evaluate((name) => {
    const buttons = [...document.querySelectorAll("button")].filter((el) => el.getClientRects().length > 0 && (el.textContent?.includes(name) || el.getAttribute("aria-label")?.includes(name)))
    if (!buttons.length) return null
    buttons[0].setAttribute("data-qa-detail", "current")
    return '[data-qa-detail="current"]'
  }, name)
  assert(selector, `No visible callback control for ${name}`)
  await page.locator(selector).click()
  await has("Account-holder name")
}

console.log(`Session: https://www.browserbase.com/sessions/${browser.sessionId}`)
console.log(`Evidence: ${output}`)
try {
  await test("01-anonymous-privacy", "4, 19, 20, 24.2", async () => {
    await goto("/")
    await has("Sign in to view callbacks")
    await goto("/history")
    assert(!/QA Exact|QA Window|Account number/.test(await text()))
    return "Home and history show no customer data without authentication."
  })
  await test("02-registration-validation", "18, 22.1–22.3, 24.1", async () => {
    await goto("/register")
    await has("Create your callback workspace")
    await fill('#register-company-id', "X123")
    await click("Create account")
    await has("E12345")
    assert((await page.locator('[aria-invalid="true"]').count()) > 0, "Invalid credentials did not receive field errors")
    assert((await text()).includes("does not verify employee identity"))
    return "Invalid registration inputs show field errors; enrollment does not claim identity verification."
  })
  await test("03-register-test-account", "18, 24.1", async () => {
    await goto("/register")
    await fill('#register-company-id', companyId)
    await fill('#register-pin', pin)
    await fill('#register-confirm-pin', pin)
    await click("Create account")
    await check(async () => !(await page.locator('#register-company-id').count()) || (await page.locator('[role="alert"]').count()) > 0, "Registration did not finish", 40_000)
    assert(!(await page.locator('#register-company-id').count()), `Registration rejected: ${(await text()).slice(-1500)}`)
    registered = true
    await goto("/")
    await has("New Callback")
    return "Created a new disposable account through the registration UI; authenticated calendar loaded."
  })
  if (!registered) throw new Error("Authenticated journeys blocked by registration failure")
  await test("04-stagehand-navigation", "September 5 update, 24.13", async () => {
    try { await stagehand.act("Click the Callback history link in the main navigation.") }
    catch (error) { toolingIssues.push(`Stagehand act: ${error instanceof Error ? error.message : String(error)}`); await click("Callback history") }
    await has("Closed callbacks and the outcomes you recorded.")
    await click("New Callback")
    await has("Add customer details")
    await dismiss()
    await click("Home")
    await has("New Callback")
    return `${toolingIssues.length ? "Deterministic fallback" : "Stagehand natural-language navigation"} reached History; New Callback opens there and on Home.`
  })
  await test("05-required-callback-fields", "9, 22.5, 24.3", async () => {
    await click("New Callback")
    await click("Save callback")
    assert(await page.locator('#new-phone_number').count())
    assert(await page.evaluate(() => document.querySelector('input[name="phone_number"]')?.matches(":invalid") ?? false))
    await dismiss()
    return "Native validation blocks empty required fields."
  })
  await test("06-exact-create-reload-privacy", "9–11, 19, 24.3, 24.7", async () => {
    await openNew(names.exact)
    await fill('#new-comments', "Synthetic browser QA; no real customer data.")
    await saveCallback()
    await page.reload()
    await has(names.exact)
    assert(!(await text()).includes(account), "Full account number appears on Home")
    await openDetails(names.exact)
    await has(account)
    await has("Synthetic browser QA")
    return "Exact callback persists across reload; full account number appears in details, not the calendar."
  })
  await test("07-exact-conflict-warning", "10.3, 24.4", async () => {
    await openNew(names.conflict)
    await click("Save callback")
    await check(async () => /overlap|conflict|already scheduled/i.test(await text()), "No same-time conflict warning")
    assert(await page.locator('#new-phone_number').count(), "Conflict unexpectedly saved without warning")
    await click("Save callback")
    await check(async () => !(await page.locator('#new-phone_number').count()), "Conflict prevented confirmation/save")
    await has(names.conflict)
    return "Same-time collision warns, then saves on confirmation."
  })
  await test("08-window-create", "9–11, 24.3, 24.7", async () => {
    await openNew(names.window, "window", 120)
    await saveCallback()
    await page.reload()
    await has(names.window)
    await openDetails(names.window)
    return "Window callback created with separately selected start/end times and persisted after reload."
  })
  await test("09-inverted-window", "9.3, 22.7, 24.3", async () => {
    await openNew("QA Invalid Window", "window", 180)
    await schedule("window_end_at", 170)
    await click("Save callback")
    await check(async () => /end.*(later|after)|later.*start/i.test(await text()), "No invalid-window error")
    assert(await page.locator('#new-phone_number').count())
    await dismiss()
  })
  await test("10-save-failure", "9.5, 22.9", async () => {
    await openNew("QA Failed Save", "exact", 240)
    bridge.failNextMutation = true
    await click("Save callback")
    await has("connection was interrupted")
    assert.equal(await page.locator('#new-account_holder_name').inputValue(), "QA Failed Save")
    await dismiss()
    await page.reload()
    assert(!(await text()).includes("QA Failed Save"))
    return "Injected network failure shows an error, retains entered data, and does not create a phantom callback."
  })
  await test("11-calendar-views", "11, 24.7", async () => {
    await dismiss()
    const snapshot = await page.locator('body').innerText()
    assert(/Week|Weekly/i.test(snapshot) && /Month|Monthly/i.test(snapshot), "Month/week controls missing")
    return "Month and week controls present. Marker geometry and view switching recorded separately."
  })
  await test("12-workload-prioritization", "8.1, 17, 24.11", async () => {
    const visible = await text()
    assert(/Scheduled today/i.test(visible) && /Upcoming/i.test(visible) && /Overdue/i.test(visible) && /Completed today/i.test(visible), "Required workload summaries / prioritized action list are missing from Home")
  })
  await test("13-search-discovery", "16, 24.10", async () => {
    assert((await page.locator('input[type="search"], input[placeholder*="earch"], [role="searchbox"]').count()) > 0, "No callback search control on Home")
  })
  await test("14-complete-reached", "13.2, 24.8", async () => {
    await openDetails(names.exact)
    await page.locator('[role="dialog"] select').selectOption("reached")
    await check(async () => !(await page.locator('[role="dialog"]').count()), "Status mutation did not close dialog")
    await goto("/history")
    await has(names.exact)
    await has("Reached")
    assert(!(await text()).includes(account))
    return "Customer reached closes the callback and adds a masked History record."
  })
  await test("15-history-filter-counts", "September 5 update, 17", async () => {
    await page.locator('#history-outcome').selectOption("voicemail")
    await has("No callbacks with this outcome")
    await page.locator('#history-outcome').selectOption("reached")
    await has(names.exact)
    await has("agent-reported")
    return "Outcome filter changes records; History describes surviving records and agent-reported outcomes."
  })
  await test("16-unsuccessful-rescheduling-history", "13.3–13.6, 15.2, 24.8", async () => {
    await goto("/")
    await openDetails(names.window)
    const visible = await text()
    assert(/reschedule/i.test(visible), "Callback details offer immediate status changes but no close-or-reschedule decision, attempt note, or attempt history")
  })
  await test("17-voicemail-closure", "13.3, 24.8", async () => {
    await dismiss()
    await openDetails(names.window)
    await page.locator('[role="dialog"] select').selectOption("voicemail")
    await goto("/history?outcome=voicemail")
    await has(names.window)
  })
  await test("18-no-answer-closure", "13.4, 24.8", async () => {
    await goto("/")
    await openDetails(names.conflict)
    await page.locator('[role="dialog"] select').selectOption("no_answer")
    await goto("/history?outcome=no_answer")
    await has(names.conflict)
  })
  await test("19-edit-closed-callback", "10.4, 13.7, 24.9", async () => {
    await openDetails(names.conflict)
    await click("Edit callback")
    await fill('#new-comments', "Edited after closure by browser QA")
    await click("Save callback")
    await check(async () => !(await page.locator('#new-comments').count()), "Closed callback edit did not save")
    await has("Edited after closure by browser QA")
  })
  await test("20-delete-callback", "13.7, 22.13, 24.9", async () => {
    await dismiss()
    await openDetails(names.conflict)
    await click("Delete callback")
    await has("Delete callback?")
    await click("Cancel", '[role="alertdialog"]')
    await has("Callback details")
    await click("Delete callback")
    await click("Delete callback", '[role="alertdialog"]')
    await check(async () => !(await page.locator('[role="alertdialog"]').count()), "Deletion did not finish")
    await page.reload()
    assert(!(await text()).includes(names.conflict))
    return "Cancel preserves the record; confirmed deletion removes it after reload."
  })
  await test("21-notification-settings", "12, 22.10–22.12, 24.6", async () => {
    await dismiss()
    await click("Settings")
    assert(/notification/i.test(await page.locator('[role="dialog"]').innerText()), "Settings has PIN and account deletion only; notification permission/status controls are absent")
  })
  await test("22-settings-global-new", "6.2, 8.5, September 5 update", async () => {
    assert(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].some((el) => /New Callback/i.test(el.textContent ?? ""))), "New Callback is unavailable while Settings is open")
  })
  await test("23-desktop-resize-keyboard", "21.3, 22.15, 24.12", async () => {
    await dismiss()
    await page.setViewportSize({ width: 700, height: 900 })
    await goto("/")
    await click("New Callback")
    assert(await page.evaluate(() => { const d = document.querySelector('[role="dialog"]')?.getBoundingClientRect(); return !!d && d.left >= 0 && d.right <= innerWidth }))
    await page.keyboard.press("Tab")
    assert(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
    await page.keyboard.press("Escape")
    assert(!(await page.locator('[role="dialog"]').count()))
    return "700px desktop window remains usable; dialog fits, Tab stays in dialog, Escape closes."
  })
  await test("24-phone-deterrent", "21.1, 24.12", async () => {
    await bridge.emulate({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone" })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert(/unsupported|desktop.*(required|only)|not supported.*phone|use.*desktop/i.test(await text()), "Phone user agent receives the regular authenticated application; unsupported-device deterrent is missing")
  })
  await bridge.emulate({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36", platform: "Win32" })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await test("25-pin-change-validation", "September 5 update, 18, 22.2", async () => {
    await click("Settings")
    await fill('#settings-current', pin)
    await fill('#settings-new', newPin)
    await fill('#settings-repeat', "000000")
    await click("Update PIN")
    await check(async () => /match/i.test(await page.locator('[role="dialog"]').innerText()), "No PIN mismatch validation")
    await fill('#settings-repeat', newPin)
    await click("Update PIN")
    await check(async () => /PIN.*(updated|changed)/i.test(await page.locator('[role="dialog"]').innerText()), "PIN update was not confirmed")
    pin = newPin
    return "Mismatched confirmation rejected; correct current PIN updates the credential."
  })
  await test("26-sign-in-new-pin", "18, 24.1", async () => {
    await dismiss()
    await page.context().clearCookies()
    await goto("/login")
    await fill('#login-company-id', companyId)
    await fill('#login-pin', pin)
    await click("Log in")
    await check(async () => !(await page.locator('#login-company-id').count()), "New PIN could not sign in", 30_000)
    await goto("/")
    await has("New Callback")
  })
} catch (error) {
  results.push({ id: "journey-blocker", requirements: "Authenticated journeys", status: "BLOCKED", evidence: error instanceof Error ? error.message : String(error) })
} finally {
  if (registered) await test("99-delete-test-account", "September 5 update", async () => {
    await dismiss()
    await click("Settings")
    await click("Delete account…")
    await fill('#settings-current', pin)
    await fill('#settings-confirm', "DELETE")
    await click("Permanently delete account")
    await check(async () => (await page.url()).includes("/login"), "Test account deletion did not redirect to login", 30_000)
    return "Deleted only the disposable account created by this run and its callbacks through Settings."
  })
  await saveReport()
  try { await session.close() } catch (error) { console.error("Session cleanup failed:", error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
  console.log(`Report: ${output}/report.md`)
  if (results.some((result) => result.status !== "PASS")) process.exitCode = 1
}
