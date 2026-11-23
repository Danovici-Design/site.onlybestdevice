/** Perioada reducerii unei variante, din `/store/offer-periods`. */
export type OfferPeriod = { starts_at: string; ends_at: string | null }

/** Perioadele pe variantă (`variant_id` → perioadă). */
export type OfferPeriods = Record<string, OfferPeriod>

const TIME_ZONE = "Europe/Bucharest"

const parts = (iso: string) => {
  const p = new Intl.DateTimeFormat("ro-RO", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(Date.parse(iso))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ""
  return { day: get("day"), month: get("month"), year: get("year") }
}

/**
 * „Ofertă valabilă în perioada 24–29 noiembrie 2026", sau, pentru reducerile
 * fără dată de final, „Ofertă valabilă începând cu 12 noiembrie 2026".
 * Ora României, oricare ar fi fusul vizitatorului.
 */
export const formatOfferPeriod = (period: OfferPeriod): string => {
  const a = parts(period.starts_at)
  if (!period.ends_at) {
    return `Ofertă valabilă începând cu ${a.day} ${a.month} ${a.year}.`
  }
  const b = parts(period.ends_at)
  const range =
    a.year !== b.year
      ? `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`
      : a.month !== b.month
        ? `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`
        : a.day === b.day
          ? `${a.day} ${a.month} ${a.year}`
          : `${a.day}–${b.day} ${a.month} ${a.year}`
  return `Ofertă valabilă în perioada ${range}.`
}
