import { HttpTypes } from "@medusajs/types"

export const SALE_BADGE_LABEL = "Ofertă"

/**
 * Tagul scris de bifa „Ofertă specială" din admin. Exact un tag, fără sinonime
 * moștenite din import (`sale`, `reducere`…), ca bifa din admin să fie singura
 * cale de a-l pune și scoate. Aliniat cu `OFFER_TAG` din
 * `backend/src/lib/discounted-products.ts`.
 */
const SALE_TAG = "oferta"

const isPicked = (product: HttpTypes.StoreProduct): boolean =>
  (product.tags ?? []).some((t) => (t.value ?? "").toLowerCase() === SALE_TAG)

/**
 * O variantă are acum un preț promoțional real: din o price list de tip `sale`
 * și sub prețul normal (Medusa aplică deja programarea listei). Produsele se
 * citesc fără client logat, deci o listă pe grup de clienți nu ajunge aici.
 */
const isDiscounted = (product: HttpTypes.StoreProduct): boolean =>
  (product.variants ?? []).some((v) => {
    const cp = v.calculated_price
    return (
      cp?.calculated_price?.price_list_type === "sale" &&
      cp.calculated_amount != null &&
      cp.original_amount != null &&
      cp.calculated_amount < cp.original_amount
    )
  })

/**
 * Produsul e „ofertă": bifat „Ofertă specială" ȘI redus acum. Aceeași regulă
 * ca lista /oferte (`offersPredicateSql` în backend), ca badge-ul și pagina să
 * nu se contrazică — un produs bifat la preț întreg nu primește badge.
 */
export const isSaleProduct = (product: HttpTypes.StoreProduct): boolean =>
  isPicked(product) && isDiscounted(product)
