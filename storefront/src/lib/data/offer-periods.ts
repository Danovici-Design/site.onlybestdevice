"use server"

import { sdk } from "@lib/config"
import type { OfferPeriods } from "@lib/util/offer-period"

/**
 * Perioada reducerii pe fiecare variantă a produsului (`/store/offer-periods`),
 * pentru data din mențiunea „În limita stocului disponibil".
 *
 * Sub tagul `products`, ca prețurile: când se schimbă o reducere, pleacă
 * împreună. Plus 5 minute, pentru mutările de date dintr-o listă de prețuri,
 * care nu emit niciun eveniment. La eroare întoarce gol — mențiunea rămâne,
 * doar fără dată.
 */
export const getOfferPeriods = async (productId: string): Promise<OfferPeriods> => {
  try {
    const { periods } = await sdk.client.fetch<{ periods: OfferPeriods }>(
      `/store/offer-periods`,
      {
        method: "GET",
        query: { product_id: productId },
        next: { revalidate: 300, tags: ["products"] },
        cache: "force-cache",
      }
    )
    return periods ?? {}
  } catch {
    return {}
  }
}
