export function toLocalDateTime(value: string | Date): string {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function nextScheduleMinute(): string {
  return toLocalDateTime(
    new Date(Math.floor(Date.now() / 60000) * 60000 + 60000)
  )
}
