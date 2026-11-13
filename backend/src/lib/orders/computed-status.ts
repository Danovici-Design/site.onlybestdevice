import {
  getLastFulfillmentStatus,
  getLastPaymentStatus,
} from "@medusajs/core-flows"

/**
 * `payment_status` și `fulfillment_status` NU sunt coloane: Medusa le calculează
 * în rutele ei (`getOrderDetailWorkflow` — adminul standard, Store API-ul din
 * care citește storefront-ul). `query.graph` nu le întoarce deloc, nici dacă le
 * ceri explicit în `fields` — cheile lipsesc din rezultat, fără eroare.
 *
 * Până la 13.11.2026 tot codul nostru care citea comanda prin `query.graph` le
 * vedea goale: statusul din admin nu știa de capturi, gestiunea nu primea
 * niciodată `refunded`, iar snapshot-ul etichetelor manuale ținea `null` acolo
 * unde storefront-ul vedea valoarea reală — deci eticheta nu apărea niciodată
 * clientului (comanda #412 arăta „Finalizată” în admin și „Anulată” pe site).
 *
 * Le calculăm cu exact funcțiile din Medusa, ca valorile să fie identice cu
 * cele pe care le vede storefront-ul.
 */

/** Câmpurile de care au nevoie cele două calcule. */
export const COMPUTED_STATUS_FIELDS = [
  "currency_code",
  "payment_collections.status",
  "payment_collections.amount",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

export const withComputedStatuses = <T extends Record<string, any>>(
  order: T | null | undefined
): (T & { payment_status: string; fulfillment_status: string }) | null => {
  if (!order) return null
  const input = {
    ...order,
    payment_collections: order.payment_collections ?? [],
    fulfillments: order.fulfillments ?? [],
  } as any
  return {
    ...order,
    payment_status: order.payment_status ?? getLastPaymentStatus(input),
    fulfillment_status:
      order.fulfillment_status ?? getLastFulfillmentStatus(input),
  }
}
