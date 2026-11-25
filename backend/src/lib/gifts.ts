import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

import { readProductPrices } from "./pricing"

/**
 * Produse care vin cu cadou: bifa „Vine cu cadou" din admin + produsele-cadou
 * alese (o husă, o folie…). Cadoul intră singur în coș odată cu produsul, la
 * preț 0, cu prețul lui normal păstrat ca preț tăiat.
 *
 * - Configurația stă în `metadata` produsului principal: `gift_enabled` (bifa)
 *   și `gift_items` (lista de cadouri, câte o variantă anume — husa neagră, nu
 *   „husa"). Bifa se poate scoate fără să pierzi lista.
 * - Nu e tag: un tag pus pe multe produse strică raftul „similare" și cache-ul
 *   coșului (vezi product-tag-side-effects), iar cadoul nu are nevoie de filtrare
 *   în listări.
 * - Cadoul e un produs obișnuit din catalog, nu unul de serviciu: are poză,
 *   pagină și stoc, iar stocul lui scade la comandă ca al oricărui produs.
 *
 * În coș, linia de cadou poartă `gift_for` / `gift_for_title` (ce produs a
 * adus-o) și urmează regulile garanției: cantitate = bucățile produsului, iese
 * odată cu el — vezi `syncWarrantyLines`.
 *
 * ATENȚIE la ștergere: `metadata` se scrie prin MERGE; o cheie se golește cu
 * **șir gol**, nu cu `null`.
 *
 * Cheile trebuie să rămână aliniate cu `storefront/src/lib/util/gifts.ts`.
 */

export const GIFT_META = {
  enabled: "gift_enabled",
  items: "gift_items",
} as const

/** Cheile din metadata liniei de cadou: ce produs din coș a adus-o. */
export const GIFT_FOR = "gift_for"
export const GIFT_FOR_TITLE = "gift_for_title"

/** Câte cadouri se pot lega de un produs. */
export const MAX_GIFTS = 5

export type GiftItem = { product_id: string; variant_id: string }

export type GiftConfig = {
  enabled: boolean
  items: GiftItem[]
}

export const parseGiftConfig = (
  metadata?: Record<string, unknown> | null
): GiftConfig => {
  const rawEnabled = metadata?.[GIFT_META.enabled]
  const rawItems = metadata?.[GIFT_META.items]
  const items: GiftItem[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const product_id = (raw as any)?.product_id
    const variant_id = (raw as any)?.variant_id
    if (typeof product_id !== "string" || typeof variant_id !== "string") continue
    if (!product_id || !variant_id || seen.has(variant_id)) continue
    seen.add(variant_id)
    items.push({ product_id, variant_id })
  }
  return {
    enabled: rawEnabled === true || rawEnabled === "true",
    items: items.slice(0, MAX_GIFTS),
  }
}

/** Cadourile active ale unui produs: bifa pusă și cel puțin un cadou ales. */
export const activeGifts = (
  metadata?: Record<string, unknown> | null
): GiftItem[] => {
  const config = parseGiftConfig(metadata)
  return config.enabled ? config.items : []
}

export type GiftDetails = GiftItem & {
  product_title: string
  product_handle: string | null
  variant_title: string | null
  sku: string | null
  thumbnail: string | null
  /** Prețul cu care se vinde azi cadoul (promoțional, dacă e la promoție). */
  value: number | null
  /** Produsul sau varianta nu mai există (șters din catalog). */
  missing: boolean
}

/**
 * Valoarea cadoului — prețul la care l-ar plăti clientul separat. E prețul tăiat
 * de pe linia din coș, deci se ia prețul de azi (cel promoțional, dacă există),
 * nu cel de listă: altfel „economisești X lei" ar exagera.
 */
const valuesByVariant = async (
  container: any,
  productIds: string[]
): Promise<Map<string, number | null>> => {
  const out = new Map<string, number | null>()
  await Promise.all(
    [...new Set(productIds)].map(async (productId) => {
      try {
        const { variants } = await readProductPrices(container, productId)
        for (const v of variants) out.set(v.id, v.sale_price ?? v.price ?? null)
      } catch {
        // produs șters — rămâne fără valoare
      }
    })
  )
  return out
}

export const describeGifts = async (
  container: any,
  items: GiftItem[]
): Promise<GiftDetails[]> => {
  if (!items.length) return []
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "thumbnail",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.thumbnail",
    ],
    filters: { id: [...new Set(items.map((i) => i.product_id))] },
  })
  const products = new Map((data as any[]).map((p) => [p.id, p]))
  const values = await valuesByVariant(
    container,
    items.map((i) => i.product_id)
  )

  return items.map((item) => {
    const product = products.get(item.product_id)
    const variant = ((product?.variants ?? []) as any[]).find(
      (v) => v.id === item.variant_id
    )
    return {
      ...item,
      product_title: product?.title ?? "",
      product_handle: product?.handle ?? null,
      variant_title:
        variant?.title && variant.title !== product?.title
          ? variant.title
          : null,
      sku: variant?.sku ?? null,
      thumbnail: variant?.thumbnail ?? product?.thumbnail ?? null,
      value: values.get(item.variant_id) ?? null,
      missing: !product || !variant,
    }
  })
}

export type GiftCard = GiftConfig & { gifts: GiftDetails[] }

export const readGiftCard = async (
  container: any,
  productId: string
): Promise<GiftCard> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productId },
  })
  const product = (data as any[])[0]
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Produsul nu există")
  }
  const config = parseGiftConfig(product.metadata)
  return { ...config, gifts: await describeGifts(container, config.items) }
}

export type GiftUpdate = {
  enabled?: boolean
  items?: GiftItem[]
}

/**
 * Scrie bifa și/sau lista de cadouri. Lista se validează aici: fiecare variantă
 * trebuie să existe și să aparțină produsului trimis, iar produsul nu poate fi
 * propriul cadou.
 */
export const writeGiftConfig = async (
  container: any,
  productId: string,
  { enabled, items }: GiftUpdate
): Promise<void> => {
  const metadata: Record<string, unknown> = {}

  if (enabled !== undefined) {
    metadata[GIFT_META.enabled] = enabled ? true : ""
  }

  if (items !== undefined) {
    const unique = parseGiftConfig({ [GIFT_META.items]: items }).items
    if (items.length > MAX_GIFTS) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cel mult ${MAX_GIFTS} cadouri pe un produs`
      )
    }
    if (unique.some((i) => i.product_id === productId)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Produsul nu poate fi propriul cadou"
      )
    }
    const described = await describeGifts(container, unique)
    const bad = described.find((d) => d.missing)
    if (bad) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Una dintre variantele alese nu mai există"
      )
    }
    metadata[GIFT_META.items] = unique.length ? unique : ""
  }

  if (!Object.keys(metadata).length) return

  await updateProductsWorkflow(container).run({
    input: { selector: { id: productId }, update: { metadata } as any },
  })
}
