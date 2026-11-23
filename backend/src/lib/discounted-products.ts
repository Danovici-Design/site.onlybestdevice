/**
 * Prețurile promoționale care se aplică ACUM: un preț fără reguli proprii
 * (fără regiune, cantitate minimă…) dintr-o price list de tip `sale` activă,
 * publică (`rules_count = 0`), în intervalul ei, și mai mic decât prețul
 * normal al variantei. Aceleași condiții după care
 * Medusa calculează prețul tăiat, deci tot ce intră aici are preț tăiat pe card
 * — iar o promoție programată, încă nepornită, nu apare pe /oferte la preț
 * întreg.
 *
 * Sursa unică pentru /oferte (împreună cu bifa), filtrul „Redus acum” din
 * admin, „Scoate reducerea” (`removeLiveSalePrices`) și perioada ofertei de pe
 * pagina produsului (`/store/offer-periods`): ce se numără e exact ce se șterge. Trebuie să rămână
 * aliniată cu `isDiscounted` din storefront (`lib/util/sale.ts`), care dă
 * badge-ul.
 *
 * Cere binding-ul `:currency` în cererea în care e inclusă.
 */
export const liveSalePricesSql = `
  SELECT sp.id AS price_id, sp.price_list_id, v.id AS variant_id, v.product_id,
         sp.amount, sp.created_at AS price_created_at,
         pl.starts_at AS list_starts_at, pl.ends_at AS list_ends_at
  FROM product_variant v
  JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
  JOIN price sp ON sp.price_set_id = vps.price_set_id
               AND sp.deleted_at IS NULL
               AND sp.currency_code = :currency
               AND COALESCE(sp.rules_count, 0) = 0
  JOIN price_list pl ON pl.id = sp.price_list_id
                    AND pl.deleted_at IS NULL
                    AND pl.type = 'sale'
                    AND pl.status = 'active'
                    AND pl.rules_count = 0
                    AND (pl.starts_at IS NULL OR pl.starts_at <= NOW())
                    AND (pl.ends_at   IS NULL OR pl.ends_at   >= NOW())
  JOIN price bp ON bp.price_set_id = vps.price_set_id
               AND bp.deleted_at IS NULL
               AND bp.price_list_id IS NULL
               AND bp.currency_code = :currency
               AND COALESCE(bp.rules_count, 0) = 0
  WHERE v.deleted_at IS NULL
    AND v.product_id IS NOT NULL
    AND sp.amount < bp.amount`

/** Id-urile produselor din `liveSalePricesSql` — bun pentru `IN` / `NOT IN`. */
export const discountedProductsSql = `
  SELECT live.product_id FROM (${liveSalePricesSql}) live`

/**
 * Tagul bifei „Ofertă specială": împreună cu o reducere în vigoare, pune
 * produsul pe /oferte, în secțiunea Oferte de pe home și sub badge-ul „Ofertă”
 * (vezi `offersPredicateSql`). Aliniat cu `SALE_TAG` din storefront
 * (`lib/util/sale.ts`).
 */
export const OFFER_TAG = "oferta"

/** Produsele care poartă tagul legat la `tagBinding` (ex. `:sale_0`). */
export const taggedProductsSql = (tagBinding: string) => `
  SELECT pt.product_id
  FROM product_tags pt
  JOIN product_tag t ON t.id = pt.product_tag_id AND t.deleted_at IS NULL
  WHERE LOWER(t.value) = ${tagBinding}
    AND pt.product_id IS NOT NULL`

/**
 * Regula /oferte, ca predicat pe `p.id`: bifat „Ofertă specială” ȘI redus acum
 * (preț promoțional în vigoare). Nici bifa singură (produs la preț întreg pe
 * /oferte), nici reducerea singură (toate cele ~217 produse reduse) nu sunt
 * suficiente — deciziile utilizatorului din 23.11.2026. Folosită de
 * /store/catalog și de pagina „Oferte” din admin, ca cele două să numere la
 * fel; aliniată cu `isSaleProduct` din storefront (`lib/util/sale.ts`).
 */
export const offersPredicateSql = (offerBinding: string) =>
  `(p.id IN (${taggedProductsSql(offerBinding)})
    AND p.id IN (${discountedProductsSql}))`
