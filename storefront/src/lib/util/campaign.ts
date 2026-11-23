/**
 * Campania curentă (Black Week).
 *
 * Numele, adresa și titlul price list-ului stau aici; DATELE nu: se citesc din
 * price list-ul din Admin, prin `/store/campaign`, ca mutarea campaniei din
 * Admin > Liste de prețuri să nu ceară deploy. `priceList` trebuie să rămână
 * aliniat cu `CAMPAIGN_PRICE_LIST_TITLE` din `backend/src/lib/campaign.ts`.
 */
export const CAMPAIGN = {
  name: "Black Week",
  path: "/black-week",
  // Titlul listei din Admin. Rămâne „Black Weekend" (așa a fost creată pe
  // prod); pe site campania se numește „Black Week".
  priceList: "Black Weekend",
}

/** Perioada campaniei, în milisecunde (inclusiv capătul). */
export type CampaignDates = { start: number; end: number }

export type CampaignPhase = "upcoming" | "live" | "ended"

/** Fără listă (ștearsă, ciornă) campania e considerată încheiată. */
export const getCampaignPhase = (
  campaign: CampaignDates | null,
  now: number
): CampaignPhase => {
  if (!campaign) return "ended"
  if (now < campaign.start) return "upcoming"
  return now <= campaign.end ? "live" : "ended"
}

/** Răspunsul lui `/store/campaign` → date, sau `null` dacă e incomplet. */
export const parseCampaign = (
  raw: { starts_at?: string | null; ends_at?: string | null } | null | undefined
): CampaignDates | null => {
  const start = raw?.starts_at ? Date.parse(raw.starts_at) : NaN
  const end = raw?.ends_at ? Date.parse(raw.ends_at) : NaN
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null
}

// Ora României, oricare ar fi fusul serverului sau al vizitatorului: o listă care
// se termină duminică la 23:59 nu trebuie să apară „luni” pe un server în UTC.
const TIME_ZONE = "Europe/Bucharest"

const parts = (ms: number) => {
  const p = new Intl.DateTimeFormat("ro-RO", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
  }).formatToParts(ms)
  return {
    day: p.find((x) => x.type === "day")?.value ?? "",
    month: p.find((x) => x.type === "month")?.value ?? "",
  }
}

/** „27 noiembrie" */
export const formatCampaignStart = (c: CampaignDates): string => {
  const { day, month } = parts(c.start)
  return `${day} ${month}`
}

/** „27–29 noiembrie", sau „27 noiembrie – 4 decembrie" peste lună. */
export const formatCampaignDates = (c: CampaignDates): string => {
  const a = parts(c.start)
  const b = parts(c.end)
  if (a.month === b.month) {
    return a.day === b.day ? `${a.day} ${a.month}` : `${a.day}–${b.day} ${a.month}`
  }
  return `${a.day} ${a.month} – ${b.day} ${b.month}`
}

/** „00:00" — ora de start, în ora României. */
export const formatCampaignStartTime = (c: CampaignDates): string =>
  new Intl.DateTimeFormat("ro-RO", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(c.start)
