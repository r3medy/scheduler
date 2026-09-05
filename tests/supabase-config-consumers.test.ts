import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  next: vi.fn(() => ({ cookies: { set: vi.fn() } })),
}))

vi.mock("server-only", () => ({}))
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createAdminClient,
}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}))
vi.mock("next/server", () => ({
  NextResponse: { next: mocks.next },
}))

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { proxy } from "@/proxy"

const request = {
  cookies: {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  },
}

describe("Supabase runtime configuration consumers", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret")
    mocks.createServerClient.mockReturnValue({
      auth: { getClaims: mocks.getClaims },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("passes through without constructing a proxy client for a malformed URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "supabase.example")

    await proxy(request as never)

    expect(mocks.next).toHaveBeenCalledWith({ request })
    expect(mocks.createServerClient).not.toHaveBeenCalled()
    expect(mocks.getClaims).not.toHaveBeenCalled()
  })

  it("constructs proxy and admin clients with normalized credentials", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "  https://project.supabase.co/path  "
    )
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "  publishable-key  ")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "  service-role-secret  ")

    await proxy(request as never)
    createSupabaseAdminClient()

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co/path",
      "publishable-key",
      expect.any(Object)
    )
    expect(mocks.createAdminClient).toHaveBeenCalledWith(
      "https://project.supabase.co/path",
      "service-role-secret",
      expect.any(Object)
    )
  })

  it("does not construct an admin client from invalid or blank configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "supabase.example")
    expect(createSupabaseAdminClient()).toBeNull()

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "   ")
    expect(createSupabaseAdminClient()).toBeNull()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
