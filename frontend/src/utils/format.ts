const pkr = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
const pkr2 = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('en')

// The backend serializes Pydantic `Decimal` fields (money, wastage quantities, etc.) as
// JSON strings, not numbers, to avoid float rounding -- every formatter here must coerce
// before calling a numeric method, or a string payload throws "value.toFixed is not a
// function" and (without an error boundary) takes the whole page down with it.
export const money = (value: number): string => pkr.format(Number(value))
export const moneyExact = (value: number): string => pkr2.format(Number(value))
export const moneyCompact = (value: number): string => `Rs ${compact.format(Number(value))}`
export const count = (value: number): string => integer.format(Number(value))
export const quantity = (value: number, unit?: string): string =>
  `${Number(Number(value).toFixed(3)).toLocaleString('en')}${unit ? ` ${unit}` : ''}`
export const percent = (value: number): string => `${Number(value).toFixed(1)}%`

// API datetimes are UTC without a zone suffix; show them in the viewer's local time.
const asUtc = (iso: string): Date => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
export const dateTime = (iso: string): string =>
  asUtc(iso).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })
export const dateOnly = (iso: string): string => asUtc(iso).toLocaleDateString('en-PK', { dateStyle: 'medium' })
export const timeAgo = (iso: string): string => {
  const minutes = Math.round((Date.now() - asUtc(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** ISO date (YYYY-MM-DD) `days` before today, for API date filters. */
export const isoDaysAgo = (days: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
