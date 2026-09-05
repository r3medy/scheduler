import { createHmac } from "node:crypto"
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
async function request(path: string, key: string, body?: unknown) {
  const response = await fetch(`${url}${path}`, { method: body ? "POST" : "GET", headers: { apikey: key, Authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) })
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${path}`)
  }
  return { status: response.status, data: await response.json() }
}
console.log("Auth settings:", await request("/auth/v1/settings", publicKey))
const secret = process.env.AUTH_RATE_LIMIT_SECRET ?? ""
console.log("Rate-limit secret length sufficient:", secret.length >= 32)
const key = createHmac("sha256", secret).update("registration-source:local-development").digest("hex")
console.log("Rate-limit RPC:", await request("/rest/v1/rpc/auth_rate_limit_status", serviceKey, { p_scope: "registration-source", p_key: key, p_window_seconds: 900, p_max_attempts: 5, p_lockout_seconds: 0 }))
console.log("Callback schema access:", await request("/rest/v1/callbacks?select=id&limit=0", serviceKey))
console.log("Attempt schema access:", await request("/rest/v1/callback_attempts?select=id&limit=0", serviceKey))
