#!/usr/bin/env node

import fs from "node:fs"
import crypto from "node:crypto"

function parseArgs(argv) {
  const args = new Map()
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item?.startsWith("--")) continue
    args.set(item.slice(2), argv[index + 1] ?? "")
    index += 1
  }
  return args
}

function readEnv(filePath) {
  const values = {}
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

async function request(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Keep error bodies out of the report; status and headers are sufficient.
  }
  return {
    status: response.status,
    json,
    contentRange: response.headers.get("content-range") ?? "",
  }
}

function rows(response) {
  if (response?.json === null || response?.json === undefined) return []
  if (Array.isArray(response.json)) return response.json
  if (response.json.code || response.json.message) return []
  return [response.json]
}

function hasSession(response) {
  return Boolean(response?.json?.access_token)
}

function bearer(key, token) {
  return { apikey: key, authorization: `Bearer ${token}` }
}

function isDeleteSuccess(status) {
  return status === 200 || status === 204
}

function isReadSuccess(status) {
  return status === 200 || status === 206
}

const args = parseArgs(process.argv)
const envPath = args.get("env")
const accountsPath = args.get("accounts")
if (!envPath || !accountsPath) {
  console.error(
    "Usage: node supabase/tests/auth-rest-acceptance.mjs --env <app.env> --accounts <synthetic-accounts.json> [--base <gateway-url>] [--direct-auth <url>] [--wrong-attempts <n>]"
  )
  process.exit(2)
}

const env = readEnv(envPath)
const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8"))
const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const base = (args.get("base") || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, "")
const directAuth = (args.get("direct-auth") || "http://127.0.0.1:56031").replace(/\/$/, "")
const wrongAttempts = Number(args.get("wrong-attempts") || 40)

if (!publishableKey || !serviceRoleKey || !base) {
  throw new Error("Required non-secret endpoint configuration is missing")
}

const summary = {
  gatewayBase: base,
  directAuthBase: directAuth,
  wrongPinAttempts: wrongAttempts,
}
const callbackIds = new Set()
const userIds = new Set()
let ownerToken = ""

async function deleteCallback(id) {
  if (!id || !ownerToken) return
  await request(`${base}/rest/v1/callbacks?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: bearer(publishableKey, ownerToken),
  })
}

async function deleteUser(id) {
  if (!id) return
  await request(`${directAuth}/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: bearer(publishableKey, serviceRoleKey),
  })
}

try {
  const ownerAuth = await request(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: { email: accounts.owner.email, password: accounts.owner.pin },
  })
  const otherAuth = await request(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: { email: accounts.other.email, password: accounts.other.pin },
  })
  ownerToken = ownerAuth.json?.access_token ?? ""
  const otherToken = otherAuth.json?.access_token ?? ""
  const ownerId = ownerAuth.json?.user?.id ?? ""
  const otherId = otherAuth.json?.user?.id ?? ""
  summary.ownerAuthStatus = ownerAuth.status
  summary.otherAuthStatus = otherAuth.status
  summary.ownerJwtPresent = Boolean(ownerToken)
  summary.otherJwtPresent = Boolean(otherToken)
  summary.ownerUidPresent = Boolean(ownerId)
  summary.otherUidPresent = Boolean(otherId)

  const ownerHeaders = bearer(publishableKey, ownerToken)
  const otherHeaders = bearer(publishableKey, otherToken)
  const serviceHeaders = bearer(publishableKey, serviceRoleKey)
  const anonymousHeaders = { apikey: publishableKey }

  const baseline = await request(
    `${base}/rest/v1/callbacks?select=id,user_id&limit=5`,
    { headers: { ...ownerHeaders, prefer: "count=exact" } }
  )
  summary.ownerBaselineStatus = baseline.status
  summary.ownerBaselineVisibleRows = rows(baseline).length
  summary.ownerBaselineContentRange = baseline.contentRange

  const marker = crypto.randomUUID().replaceAll("-", "")
  const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  const callbackPayload = {
    user_id: ownerId,
    phone_number: "01000000000",
    account_number: `api-${marker}`,
    account_holder_name: "API Acceptance",
    comments: "temporary API acceptance row",
    schedule_mode: "exact",
    scheduled_at: scheduledAt,
    lifecycle_state: "open",
  }
  const insert = await request(`${base}/rest/v1/callbacks`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json", prefer: "return=representation" },
    body: callbackPayload,
  })
  const insertRows = rows(insert)
  const callbackId = insertRows[0]?.id ?? ""
  if (callbackId) callbackIds.add(callbackId)
  summary.ownerInsertStatus = insert.status
  summary.ownerInsertRows = insertRows.length
  summary.ownerInsertIdPresent = Boolean(callbackId)

  if (callbackId) {
    const ownerGet = await request(
      `${base}/rest/v1/callbacks?id=eq.${encodeURIComponent(callbackId)}&select=id,user_id,comments`,
      { headers: ownerHeaders }
    )
    const otherGet = await request(
      `${base}/rest/v1/callbacks?id=eq.${encodeURIComponent(callbackId)}&select=id,user_id`,
      { headers: otherHeaders }
    )
    summary.ownerGetStatus = ownerGet.status
    summary.ownerGetRows = rows(ownerGet).length
    summary.otherGetStatus = otherGet.status
    summary.otherGetRows = rows(otherGet).length

    const otherDelete = await request(
      `${base}/rest/v1/callbacks?id=eq.${encodeURIComponent(callbackId)}`,
      { method: "DELETE", headers: otherHeaders }
    )
    const ownerAfterOtherDelete = await request(
      `${base}/rest/v1/callbacks?id=eq.${encodeURIComponent(callbackId)}&select=id`,
      { headers: ownerHeaders }
    )
    summary.otherDeleteStatus = otherDelete.status
    summary.ownerRowsAfterOtherDelete = rows(ownerAfterOtherDelete).length

    const ownerUpdate = await request(
      `${base}/rest/v1/callbacks?id=eq.${encodeURIComponent(callbackId)}`,
      {
        method: "PATCH",
        headers: { ...ownerHeaders, "content-type": "application/json", prefer: "return=representation" },
        body: { comments: "temporary API acceptance updated" },
      }
    )
    summary.ownerUpdateStatus = ownerUpdate.status
    summary.ownerUpdateRows = rows(ownerUpdate).length

    const ownerDelete = await request(
      `${base}/rest/v1/callbacks?id=eq.${encodeURIComponent(callbackId)}`,
      { method: "DELETE", headers: ownerHeaders }
    )
    summary.ownerDeleteStatus = ownerDelete.status
  }

  const crossInsert = await request(`${base}/rest/v1/callbacks`, {
    method: "POST",
    headers: { ...otherHeaders, "content-type": "application/json", prefer: "return=representation" },
    body: {
      ...callbackPayload,
      account_number: `cross-${marker}`,
      phone_number: "01000000001",
    },
  })
  const crossRows = rows(crossInsert)
  const crossId = crossRows[0]?.id ?? ""
  if (crossId) callbackIds.add(crossId)
  summary.crossOwnerInsertStatus = crossInsert.status
  summary.crossOwnerInsertRows = crossRows.length

  const anonymousGet = await request(
    `${base}/rest/v1/callbacks?select=id&limit=1`,
    { headers: anonymousHeaders }
  )
  summary.anonymousGetStatus = anonymousGet.status

  const requestKey = crypto.randomUUID()
  const rpcPayload = {
    p_request_key: requestKey,
    p_phone_number: "01000000002",
    p_account_number: `rpc-${marker}`,
    p_account_holder_name: "RPC Acceptance",
    p_comments: "temporary RPC acceptance row",
    p_schedule_mode: "exact",
    p_scheduled_at: scheduledAt,
    p_window_start_at: null,
    p_window_end_at: null,
  }
  const rpcFirst = await request(`${base}/rest/v1/rpc/create_callback_idempotent`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json", prefer: "return=representation" },
    body: rpcPayload,
  })
  const rpcFirstRows = rows(rpcFirst)
  const rpcId = rpcFirstRows[0]?.callback_id ?? ""
  if (rpcId) callbackIds.add(rpcId)
  const rpcSecond = await request(`${base}/rest/v1/rpc/create_callback_idempotent`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json", prefer: "return=representation" },
    body: rpcPayload,
  })
  const rpcSecondRows = rows(rpcSecond)
  const rpcConflict = await request(`${base}/rest/v1/rpc/create_callback_idempotent`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json", prefer: "return=representation" },
    body: {
      ...rpcPayload,
      p_phone_number: "01000000003",
      p_account_number: `rpc-conflict-${marker}`,
    },
  })
  const rpcConflictRows = rows(rpcConflict)
  summary.rpcFirstStatus = rpcFirst.status
  summary.rpcFirstCreated = rpcFirstRows[0]?.created ?? null
  summary.rpcSecondStatus = rpcSecond.status
  summary.rpcSecondCreated = rpcSecondRows[0]?.created ?? null
  summary.rpcSecondSamePayload = rpcSecondRows[0]?.same_payload ?? null
  summary.rpcConflictStatus = rpcConflict.status
  summary.rpcConflictSamePayload = rpcConflictRows[0]?.same_payload ?? null

  const admissionKey = `${crypto.randomBytes(16).toString("hex")}${crypto.randomBytes(16).toString("hex")}`
  const admissionPayload = {
    p_scope: "login-company",
    p_key: admissionKey,
    p_window_seconds: 60,
    p_max_attempts: 2,
    p_lockout_seconds: 0,
  }
  const admissionAsUser = await request(`${base}/rest/v1/rpc/auth_rate_limit_admit`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json", prefer: "return=representation" },
    body: admissionPayload,
  })
  const admissionAsService = await request(`${base}/rest/v1/rpc/auth_rate_limit_admit`, {
    method: "POST",
    headers: { ...serviceHeaders, "content-type": "application/json", prefer: "return=representation" },
    body: admissionPayload,
  })
  const admissionRows = rows(admissionAsService)
  const admissionToken = admissionRows[0]?.admission_token
  summary.admissionAsUserStatus = admissionAsUser.status
  summary.admissionAsServiceStatus = admissionAsService.status
  summary.admissionAllowed = admissionRows[0]?.allowed ?? null
  summary.admissionTokenPresent = admissionToken !== undefined && admissionToken !== null
  if (summary.admissionTokenPresent) {
    const release = await request(`${base}/rest/v1/rpc/auth_rate_limit_release`, {
      method: "POST",
      headers: { ...serviceHeaders, "content-type": "application/json", prefer: "return=representation" },
      body: { p_scope: "login-company", p_key: admissionKey, p_admission_token: admissionToken },
    })
    summary.admissionReleaseStatus = release.status
    summary.admissionReleaseSuccess = isDeleteSuccess(release.status)
  }

  const nonPinEmail = `api-${marker}@auth.scheduler.invalid`
  const nonPinSignup = await request(`${directAuth}/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: { email: nonPinEmail, password: "not-a-six-digit-pin" },
  })
  const nonPinUserId = nonPinSignup.json?.user?.id ?? ""
  if (nonPinUserId) userIds.add(nonPinUserId)
  summary.directSignupNonPinStatus = nonPinSignup.status
  summary.directSignupNonPinSession = hasSession(nonPinSignup)

  const wrongPinEmail = `wrong-pin-${marker}@auth.scheduler.invalid`
  const wrongPinSignup = await request(`${directAuth}/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: { email: wrongPinEmail, password: "654321" },
  })
  const wrongPinUserId = wrongPinSignup.json?.user?.id ?? ""
  if (wrongPinUserId) userIds.add(wrongPinUserId)
  const wrongPinCounts = {}
  const wrongPinStarted = performance.now()
  for (let index = 0; index < wrongAttempts; index += 1) {
    const attempt = await request(`${directAuth}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "content-type": "application/json" },
      body: { email: wrongPinEmail, password: "000000" },
    })
    const key = String(attempt.status)
    wrongPinCounts[key] = (wrongPinCounts[key] ?? 0) + 1
  }
  summary.directWrongPinSignupStatus = wrongPinSignup.status
  summary.directWrongPinStatusCounts = wrongPinCounts
  summary.directWrongPinElapsedMs = Math.round(performance.now() - wrongPinStarted)
  summary.directWrongPinThrottleObserved = Boolean(wrongPinCounts["429"])
} finally {
  for (const id of callbackIds) await deleteCallback(id)
  for (const id of userIds) await deleteUser(id)
}

summary.functionalPassed =
  summary.ownerAuthStatus === 200 &&
  summary.otherAuthStatus === 200 &&
  summary.ownerJwtPresent &&
  summary.otherJwtPresent &&
  isReadSuccess(summary.ownerBaselineStatus) &&
  summary.ownerInsertStatus === 201 &&
  summary.ownerGetStatus === 200 &&
  summary.ownerGetRows === 1 &&
  summary.otherGetRows === 0 &&
  summary.ownerRowsAfterOtherDelete === 1 &&
  summary.ownerUpdateStatus === 200 &&
  isDeleteSuccess(summary.ownerDeleteStatus) &&
  summary.crossOwnerInsertStatus !== 201 &&
  summary.anonymousGetStatus !== 200 &&
  summary.rpcFirstStatus === 200 &&
  summary.rpcFirstCreated === true &&
  summary.rpcSecondStatus === 200 &&
  summary.rpcSecondCreated === false &&
  summary.rpcSecondSamePayload === true &&
  summary.rpcConflictStatus === 200 &&
  summary.rpcConflictSamePayload === false &&
  summary.admissionAsUserStatus !== 200 &&
  summary.admissionAsServiceStatus === 200 &&
  summary.admissionAllowed === true &&
  summary.admissionReleaseSuccess === true &&
  summary.directSignupNonPinStatus === 200 &&
  summary.directSignupNonPinSession === true

summary.passed = summary.functionalPassed && summary.directWrongPinThrottleObserved

console.log(JSON.stringify(summary))
