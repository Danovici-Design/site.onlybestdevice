import { HttpTypes } from "@medusajs/types"

/**
 * Produse care vin cu cadou: bifa „Vine cu cadou" din admin + cadourile alese
 * (câte o variantă anume — husa neagră, nu „husa"). Cadoul intră singur în coș
 * odată cu produsul, la 0 lei, cu prețul lui normal ca preț tăiat
 * (`compare_at_unit_price`). Regula de coș stă în backend (`syncWarrantyLines`).
 *
 * Cheile trebuie să rămână aliniate cu `backend/src/lib/gifts.ts`.
 */

export const GIFT_META = {
  enabled: "gift_enabled",
  items: "gift_items",
} as const

/** Cheile din metadata liniei de cadou: ce produs din coș a adus-o. */
export const GIFT_FOR = "gift_for"
export const GIFT_FOR_TITLE = "gift_for_title"

export type GiftItem = { product_id: string; variant_id: string }

/** Cadourile active ale unui produs: bifa pusă și cel puțin un cadou ales. */
export function giftItemsOf(
  product?: { metadata?: Record<string, unknown> | null } | null
): GiftItem[] {
  const meta = product?.metadata ?? {}
  const enabled = meta[GIFT_META.enabled]
  if (enabled !== true && enabled !== "true") return []
  const raw = meta[GIFT_META.items]
  const out: GiftItem[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    const product_id = (item as any)?.product_id
    const variant_id = (item as any)?.variant_id
    if (typeof product_id === "string" && typeof variant_id === "string") {
      out.push({ product_id, variant_id })
    }
  }
  return out
}

export const hasGift = (
  product?: { metadata?: Record<string, unknown> | null } | null
) => giftItemsOf(product).length > 0

type AnyLine = {
  metadata?: Record<string, unknown> | null
  compare_at_unit_price?: number | null
  quantity?: number | null
}

export function isGiftLine(item: AnyLine): boolean {
  const target = item.metadata?.[GIFT_FOR]
  return typeof target === "string" && target.length > 0
}

/** Produsul la care a venit cadoul: „Husă … — cadou la iPhone 15". */
export function giftTargetTitle(item: AnyLine): string | null {
  const raw = item.metadata?.[GIFT_FOR_TITLE]
  return isGiftLine(item) && typeof raw === "string" && raw.length > 0
    ? raw
    : null
}

/** Cât ar fi costat cadoul cumpărat separat (toată linia). */
export function giftLineValue(item: AnyLine): number | null {
  const unit = Number(item.compare_at_unit_price)
  if (!Number.isFinite(unit) || unit <= 0) return null
  return unit * Number(item.quantity ?? 1)
}

/** Titlurile cadourilor din coș aduse de un produs, pentru eticheta de pe el. */
export function giftTitlesFor(
  productId: string | null | undefined,
  items?: HttpTypes.StoreCartLineItem[] | null
): string[] {
  if (!productId) return []
  return (items ?? [])
    .filter((i) => isGiftLine(i) && i.metadata?.[GIFT_FOR] === productId)
    .map((i) => i.product_title ?? i.title ?? "")
    .filter(Boolean)
}

/** O variantă-cadou, așa cum o arată pagina produsului. */
export type GiftOffer = {
  variantId: string
  productHandle: string | null
  title: string
  variantTitle: string | null
  thumbnail: string | null
  /** Prețul cu care s-ar vinde separat — prețul tăiat. */
  value: number | null
  currencyCode: string
}

const inStock = (v: HttpTypes.StoreProductVariant) =>
  !v.manage_inventory ||
  !!v.allow_backorder ||
  (v.inventory_quantity ?? 0) > 0

/**
 * Cadourile de afișat pe pagina produsului, în ordinea din admin. Cele epuizate
 * nu apar: oferta e „în limita stocului", iar backend-ul nici nu le-ar pune în
 * coș.
 */
export function giftOffersFor(
  items: GiftItem[],
  products: HttpTypes.StoreProduct[]
): GiftOffer[] {
  const out: GiftOffer[] = []
  for (const item of items) {
    const product = products.find((p) => p.id === item.product_id)
    const variant = product?.variants?.find((v) => v.id === item.variant_id)
    if (!product || !variant || !inStock(variant)) continue
    const price = (variant as any).calculated_price
    out.push({
      variantId: variant.id,
      productHandle: product.handle ?? null,
      title: product.title ?? "",
      variantTitle:
        variant.title && variant.title !== product.title ? variant.title : null,
      thumbnail:
        (variant as any).thumbnail ??
        (variant as any).images?.[0]?.url ??
        product.thumbnail ??
        product.images?.[0]?.url ??
        null,
      value:
        typeof price?.calculated_amount === "number"
          ? price.calculated_amount
          : null,
      currencyCode: price?.currency_code ?? "ron",
    })
  }
  return out
}
