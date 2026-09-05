export const SYNTHETIC_AUTH_DOMAIN = "auth.scheduler.invalid"

export function normalizeCompanyId(value: string): string {
  return value.trim().toUpperCase()
}

export function companyIdToSyntheticEmail(companyId: string): string {
  return `${normalizeCompanyId(companyId).toLowerCase()}@${SYNTHETIC_AUTH_DOMAIN}`
}
