// Warehouse clock times. Cut-offs are kept as 24-hour HH:MM in the pickup's
// own time zone and read the US way: "16:00" reads "4:00 PM".
export const hours = (value: unknown) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ''))
  if (!match) return '—'
  const h = Number(match[1])
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? 'AM' : 'PM'}`
}
/** An instant as a clock time in a warehouse's time zone. */
export const at = (iso: unknown, timeZone: string) => hours(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(String(iso))))
/** Today's date (YYYY-MM-DD) in a time zone. */
export const today = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const zones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
