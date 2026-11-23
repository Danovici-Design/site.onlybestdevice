import { HttpTypes } from "@medusajs/types"

export const SALE_BADGE_LABEL = "Ofertă"

/**
 * Tagul scris de bifa „Ofertă specială" din admin — singurul criteriu pentru
 * /oferte, secțiunea Oferte de pe home și badge-ul „Ofertă".
 *
 * Un preț tăiat singur NU face produsul „ofertă" (decizia din 23.11.2026):
 * produsul redus dar nebifat își arată prețul tăiat, dar fără badge și fără să
 * apară pe /oferte. Exact un tag, fără sinonime moștenite din import (`sale`,
 * `reducere`…), ca bifa din admin să fie singura cale de a-l pune și scoate.
 * Trebuie să rămână aliniat cu `OFFER_TAG` din
 * `backend/src/lib/discounted-products.ts`.
 */
const SALE_TAG = "oferta"

/** Produsul e bifat „Ofertă specială" — aceeași regulă ca lista /oferte. */
export const isSaleProduct = (product: HttpTypes.StoreProduct): boolean =>
  (product.tags ?? []).some((t) => (t.value ?? "").toLowerCase() === SALE_TAG)
