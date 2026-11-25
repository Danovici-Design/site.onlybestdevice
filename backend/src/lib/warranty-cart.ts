import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  addToCartWorkflow,
  deleteLineItemsWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows"

import {
  GIFT_FOR,
  GIFT_FOR_TITLE,
  activeGifts,
  describeGifts,
  type GiftItem,
} from "./gifts"
import { ADDON_FOR, SH_SERVICES_HANDLE } from "./second-hand"
import { WARRANTY_HANDLE } from "./warranty-prices"

/** Cheia din metadata liniei de garanție; aliniată cu storefront-ul. */
const WARRANTY_FOR = "warranty_for"

type CartLine = {
  id: string
  variant_id?: string | null
  product_id: string | null
  product_handle: string | null
  quantity: number
  metadata: Record<string, unknown> | null
  created_at: string | Date
  title?: string | null
  product_title?: string | null
}

/**
 * Ține fiecare garanție extinsă aliniată cu produsul pe care îl acoperă.
 *
 * Garanția se vinde pe bucată: două telefoane = două garanții. Cantitatea ei
 * nu e deci o alegere a clientului, ci o consecință — egală cu câte bucăți din
 * produsul acoperit sunt în coș. Regulile:
 *
 * - cantitatea garanției = suma cantităților liniilor produsului acoperit;
 * - produsul a ieșit din coș → garanția iese și ea;
 * - o singură garanție per produs: dacă cineva adaugă „+2 ani" peste „+1 an",
 *   rămâne ultima aleasă.
 *
 * Garanțiile vechi, fără `warranty_for`, nu se ating — n-avem cum să știm ce
 * acoperă (vezi `warrantyCoverage` din storefront).
 *
 * Se cheamă după orice schimbare a coșului care poate strica alinierea: la
 * adăugarea garanției, la schimbarea cantității, la ștergere și înainte de
 * crearea sesiunii de plată la finalizare.
 *
 * Tot aici se țin și cadourile (vezi `lib/gifts.ts`): produsul bifat „Vine cu
 * cadou" își primește singur linia de cadou, la preț 0, cu aceeași cantitate;
 * cadoul iese odată cu produsul sau când i se scoate bifa din admin.
 *
 * Întoarce `true` dacă a modificat totalul coșului — checkout-ul nu trebuie să
 * plaseze comanda fără ca clientul să-l vadă. Cadourile nu contează aici: sunt
 * gratuite, deci nu mișcă totalul.
 */
export const syncWarrantyLines = async (
  scope: any,
  cartId: string
): Promise<boolean> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "items.id",
      "items.product_id",
      "items.variant_id",
      "items.product_handle",
      "items.quantity",
      "items.metadata",
      "items.created_at",
      "items.title",
      "items.product_title",
    ],
    filters: { id: cartId },
  })

  const items: CartLine[] = ((carts as any[])[0]?.items ?? []).filter(Boolean)
  const isWarranty = (i: CartLine) => i.product_handle === WARRANTY_HANDLE
  // Serviciile Second Hand (baterie nouă, folie montată) urmează aceleași
  // reguli ca garanția: cantitate = bucățile produsului deservit, ies odată cu
  // el. Diferența: pot sta mai multe pe același produs (baterie ȘI folie), deci
  // dublura se judecă pe (produs, serviciu), nu doar pe produs.
  const isAddon = (i: CartLine) => i.product_handle === SH_SERVICES_HANDLE
  // Cadoul e un produs obișnuit din catalog (o husă), deci nu se recunoaște
  // după handle, ci după legătura din metadata.
  const isGift = (i: CartLine) =>
    typeof i.metadata?.[GIFT_FOR] === "string" && i.metadata[GIFT_FOR] !== ""

  const quantityByProduct = new Map<string, number>()
  const titleByProduct = new Map<string, string>()
  for (const item of items) {
    if (isWarranty(item) || isAddon(item) || isGift(item) || !item.product_id)
      continue
    titleByProduct.set(
      item.product_id,
      item.product_title ?? item.title ?? ""
    )
    quantityByProduct.set(
      item.product_id,
      (quantityByProduct.get(item.product_id) ?? 0) + Number(item.quantity)
    )
  }

  // Cea mai nouă garanție a fiecărui produs câștigă.
  const linked = items
    .filter(
      (i) =>
        isWarranty(i) &&
        typeof i.metadata?.[WARRANTY_FOR] === "string" &&
        i.metadata[WARRANTY_FOR] !== ""
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

  const toDelete: string[] = []
  const toUpdate: { id: string; quantity: number }[] = []
  const seen = new Set<string>()

  for (const line of linked) {
    const target = line.metadata![WARRANTY_FOR] as string
    const wanted = quantityByProduct.get(target) ?? 0

    if (seen.has(target) || wanted === 0) {
      toDelete.push(line.id)
      continue
    }
    seen.add(target)
    if (Number(line.quantity) !== wanted) {
      toUpdate.push({ id: line.id, quantity: wanted })
    }
  }

  const addons = items
    .filter(isAddon)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  const seenAddon = new Set<string>()
  for (const line of addons) {
    const target = line.metadata?.[ADDON_FOR]
    // Fără produs legat, serviciul n-are sens singur: iese din coș.
    const wanted =
      typeof target === "string" ? quantityByProduct.get(target) ?? 0 : 0
    const key = `${target}:${line.variant_id}`
    if (wanted === 0 || seenAddon.has(key)) {
      toDelete.push(line.id)
      continue
    }
    seenAddon.add(key)
    if (Number(line.quantity) !== wanted) {
      toUpdate.push({ id: line.id, quantity: wanted })
    }
  }

  const gifts = await planGiftLines(
    scope,
    items.filter(isGift),
    quantityByProduct
  )

  const priced = toDelete.length > 0 || toUpdate.length > 0
  if (!priced && !gifts.toDelete.length && !gifts.toUpdate.length && !gifts.toAdd.length) {
    return false
  }

  const deleteIds = [...toDelete, ...gifts.toDelete]
  if (deleteIds.length) {
    await deleteLineItemsWorkflow(scope).run({
      input: { cart_id: cartId, ids: deleteIds },
    })
  }
  for (const { id, quantity } of toUpdate) {
    await updateLineItemInCartWorkflow(scope).run({
      input: { cart_id: cartId, item_id: id, update: { quantity } },
    })
  }

  // Cadourile merg „în limita stocului": un cadou epuizat nu blochează coșul,
  // pur și simplu nu intră (sau rămâne cu cantitatea pe care o mai acoperă).
  for (const { id, quantity } of gifts.toUpdate) {
    await updateLineItemInCartWorkflow(scope)
      .run({ input: { cart_id: cartId, item_id: id, update: { quantity } } })
      .catch(() => undefined)
  }
  if (gifts.toAdd.length) {
    const details = await describeGifts(
      scope,
      gifts.toAdd.map((g) => g.gift)
    )
    const valueOf = new Map(details.map((d) => [d.variant_id, d.value]))
    for (const { gift, target, quantity } of gifts.toAdd) {
      const value = valueOf.get(gift.variant_id)
      await addToCartWorkflow(scope)
        .run({
          input: {
            cart_id: cartId,
            items: [
              {
                variant_id: gift.variant_id,
                quantity,
                unit_price: 0,
                // Prețul tăiat din coș: cât ar fi costat cadoul separat.
                ...(value ? { compare_at_unit_price: value } : {}),
                is_discountable: false,
                metadata: {
                  [GIFT_FOR]: target,
                  [GIFT_FOR_TITLE]: titleByProduct.get(target) ?? "",
                },
              } as any,
            ],
          },
        })
        .catch(() => undefined)
    }
  }

  return priced
}

/**
 * Ce trebuie făcut cu liniile de cadou: care lipsesc (produs bifat fără cadoul
 * lui în coș), care au cantitatea greșită și care trebuie scoase (produsul a
 * ieșit din coș, bifa a fost oprită, cadoul a fost schimbat în admin, dublură).
 */
const planGiftLines = async (
  scope: any,
  giftLines: CartLine[],
  quantityByProduct: Map<string, number>
) => {
  const toDelete: string[] = []
  const toUpdate: { id: string; quantity: number }[] = []
  const toAdd: { gift: GiftItem; target: string; quantity: number }[] = []

  const productIds = [...quantityByProduct.keys()]
  const giftsByProduct = new Map<string, GiftItem[]>()
  if (productIds.length) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "metadata"],
      filters: { id: productIds },
    })
    for (const p of data as any[]) {
      const gifts = activeGifts(p.metadata)
      if (gifts.length) giftsByProduct.set(p.id, gifts)
    }
  }

  const seen = new Set<string>()
  const sorted = [...giftLines].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  for (const line of sorted) {
    const target = line.metadata![GIFT_FOR] as string
    const configured = (giftsByProduct.get(target) ?? []).some(
      (g) => g.variant_id === line.variant_id
    )
    const wanted = configured ? quantityByProduct.get(target) ?? 0 : 0
    const key = `${target}:${line.variant_id}`
    if (wanted === 0 || seen.has(key)) {
      toDelete.push(line.id)
      continue
    }
    seen.add(key)
    if (Number(line.quantity) !== wanted) {
      toUpdate.push({ id: line.id, quantity: wanted })
    }
  }

  for (const [target, gifts] of giftsByProduct) {
    const quantity = quantityByProduct.get(target) ?? 0
    if (!quantity) continue
    for (const gift of gifts) {
      if (seen.has(`${target}:${gift.variant_id}`)) continue
      toAdd.push({ gift, target, quantity })
    }
  }

  return { toDelete, toUpdate, toAdd }
}
