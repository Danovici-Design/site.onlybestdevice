import { HttpTypes } from "@medusajs/types"

export const SALE_BADGE_LABEL = "Ofertă"

/**
 * Tagul scris de bifa „Ofertă" din admin — selecția echipei.
 *
 * Exact unul: dacă am accepta și sinonime moștenite din import (`sale`,
 * `reducere`, …), un produs le-ar putea purta fără ca bifa din admin să arate
 * ceva și fără să poată fi scos de acolo. Trebuie să rămână aliniat cu
 * `SALE_TAG` din `backend/src/api/store/catalog/route.ts`.
 */
const SALE_TAG = "oferta"

/**
 * Tagul bifei „Ascuns de pe /oferte": reducerea rămâne (preț tăiat), dar fără
 * /oferte și fără badge. Aliniat cu `OFFER_EXCLUDE_TAG` din
 * `backend/src/lib/discounted-products.ts`.
 */
const OFFER_EXCLUDE_TAG = "fara-oferte"

const hasTag = (product: HttpTypes.StoreProduct, tag: string): boolean =>
  (product.tags ?? []).some((t) => (t.value ?? "").toLowerCase() === tag)

const isPicked = (product: HttpTypes.StoreProduct): boolean =>
  hasTag(product, SALE_TAG)

/**
 * O variantă are acum un preț promoțional real: vine dintr-o price list de tip
 * `sale` și e sub prețul normal. Medusa aplică deja programarea listei, deci o
 * promoție încă nepornită nu trece. Aliniat cu `discountedProductsSql` din
 * ruta de catalog.
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
 * Produsul e la ofertă: bifat „Ofertă specială" SAU (redus acum ȘI nebifat
 * „Ascuns de pe /oferte"). Aceeași regulă ca lista de pe /oferte
 * (`offersPredicateSql`), ca badge-ul și pagina să nu se contrazică.
 */
export const isSaleProduct = (product: HttpTypes.StoreProduct): boolean =>
  isPicked(product) ||
  (isDiscounted(product) && !hasTag(product, OFFER_EXCLUDE_TAG))
