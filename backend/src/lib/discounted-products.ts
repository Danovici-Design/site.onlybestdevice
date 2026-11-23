/**
 * Produsele cu o reducere care se aplică ACUM: o variantă are un preț dintr-o
 * price list de tip `sale` activă, publică (`rules_count = 0`), în intervalul
 * ei, și mai mic decât prețul normal al variantei. Aceleași condiții după care
 * Medusa calculează prețul tăiat, deci tot ce intră aici are preț tăiat pe card
 * — iar o promoție programată, încă nepornită, nu apare pe /oferte la preț
 * întreg.
 *
 * Folosită de /store/catalog (pagina /oferte) și de filtrul „Redus acum” din
 * lista de produse din admin, ca cele două să numere la fel. Trebuie să rămână
 * aliniată cu `isDiscounted` din storefront (`lib/util/sale.ts`), care dă
 * badge-ul.
 *
 * Cere binding-ul `:currency` în cererea în care e inclusă.
 */
export const discountedProductsSql = `
  SELECT v.product_id
  FROM product_variant v
  JOIN product_variant_price_set vps ON vps.variant_id = v.id AND vps.deleted_at IS NULL
  JOIN price sp ON sp.price_set_id = vps.price_set_id
               AND sp.deleted_at IS NULL
               AND sp.currency_code = :currency
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
    AND sp.amount < bp.amount`

/** Tagul bifei „Ofertă specială": produsul e pe /oferte, primul, cu sau fără reducere. */
export const OFFER_TAG = "oferta"

/**
 * Tagul bifei „Ascuns de pe /oferte": produsul își păstrează reducerea (și
 * prețul tăiat), dar nu intră pe /oferte și nu primește badge-ul „Ofertă”.
 * „Ofertă specială” are întâietate — un produs bifat cu amândouă rămâne pe
 * /oferte. Aliniat cu `OFFER_EXCLUDE_TAG` din storefront (`lib/util/sale.ts`).
 */
export const OFFER_EXCLUDE_TAG = "fara-oferte"

/** Produsele care poartă tagul legat la `tagBinding` (ex. `:sale_0`). */
export const taggedProductsSql = (tagBinding: string) => `
  SELECT pt.product_id
  FROM product_tags pt
  JOIN product_tag t ON t.id = pt.product_tag_id AND t.deleted_at IS NULL
  WHERE LOWER(t.value) = ${tagBinding}`

/**
 * Regula /oferte, ca predicat pe `p.id`: bifat „Ofertă specială” SAU (redus
 * acum ȘI nebifat „Ascuns de pe /oferte”). Folosită de /store/catalog și de
 * pagina „Oferte” din admin, ca cele două să numere la fel.
 */
export const offersPredicateSql = (offerBinding: string, excludeBinding: string) =>
  `(p.id IN (${taggedProductsSql(offerBinding)})
    OR (p.id IN (${discountedProductsSql})
        AND p.id NOT IN (${taggedProductsSql(excludeBinding)})))`
