import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  completeOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/core-flows"

type Row = Record<string, any>

export type CompleteOrderFullyResult = {
  /** Livrarea creată acum pentru liniile rămase nelivrate, dacă a fost nevoie. */
  createdFulfillment: string | null
  /** Livrări marcate acum ca expediate / livrate. */
  shipped: number
  delivered: number
  /** Plăți capturate acum (ramburs încasat, virament primit etc.). */
  capturedPayments: number
}

/**
 * Finalizează o comandă cu tot ce are pe ea: livrarea și plata, apoi comanda.
 *
 * Până acum „Finalizată” rula doar `completeOrderWorkflow`, iar comanda
 * rămânea în admin „Not fulfilled” / „Authorized” — operatorul trebuia să
 * creeze livrarea, s-o marcheze expediată și livrată și să captureze plata de
 * mână. Acum, în ordine:
 *
 *   1. liniile încă nelivrate primesc o livrare (scade stocul, consumă
 *      rezervarea — ca butonul „Create fulfillment”);
 *   2. fiecare livrare activă e marcată expediată, apoi livrată;
 *   3. plățile necapturate se capturează (rambursul încasat de curier,
 *      viramentul primit). Providerii noștri doar consemnează captura, nu
 *      cer bani nimănui;
 *   4. `completeOrderWorkflow` — `order.completed` duce comanda în gestiune.
 *
 * Toate fără email către client: emailul de status îl trimite ruta, dacă
 * operatorul a bifat „Trimite email”. Pașii sunt idempotenți — dacă unul
 * pică, o nouă încercare continuă de unde a rămas.
 *
 * Inversul, pentru coletul întors (ramburs refuzat, retur), e
 * `cancelOrderFully`: anulează livrările (stocul revine) și rambursează plata
 * capturată.
 */
export async function completeOrderFully(
  container: MedusaContainer,
  input: { order_id: string; actor_id?: string }
): Promise<CompleteOrderFullyResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const result: CompleteOrderFullyResult = {
    createdFulfillment: null,
    shipped: 0,
    delivered: 0,
    capturedPayments: 0,
  }

  const load = async () => {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        // `items.*`, nu `items.quantity` — altfel cantitatea vine undefined.
        "items.*",
        "items.detail.*",
        "fulfillments.id",
        "fulfillments.canceled_at",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.items.line_item_id",
        "fulfillments.items.quantity",
        "payment_collections.payments.id",
        "payment_collections.payments.amount",
        "payment_collections.payments.captured_at",
        "payment_collections.payments.canceled_at",
      ],
      filters: { id: input.order_id },
    })
    return data?.[0] as unknown as Row | undefined
  }

  let order = await load()
  if (!order) {
    // Lăsăm workflow-ul să dea eroarea standard de „nu există”.
    await completeOrderWorkflow(container).run({
      input: { orderIds: [input.order_id] },
    })
    return result
  }
  const tag = `#${order.display_id ?? order.id}`

  // 1. Liniile încă nelivrate.
  const toFulfill = (order.items ?? [])
    .map((item: Row) => {
      const fulfilled = item.detail?.fulfilled_quantity ?? 0
      return {
        id: item.id as string,
        quantity: Number(MathBN.sub(item.quantity, fulfilled)),
      }
    })
    .filter((i: { quantity: number }) => i.quantity > 0)

  if (toFulfill.length) {
    const { result: fulfillment } = await createOrderFulfillmentWorkflow(
      container
    ).run({
      input: {
        order_id: order.id,
        items: toFulfill,
        created_by: input.actor_id,
        no_notification: true,
      },
    })
    result.createdFulfillment = fulfillment.id
    logger.info(`[complete] ${tag}: livrare creată (${fulfillment.id}).`)
    order = (await load())!
  }

  // 2. Expediat, apoi livrat.
  const active = (order.fulfillments ?? []).filter(
    (f: Row) => f && !f.canceled_at
  )
  for (const f of active) {
    if (!f.shipped_at && !f.delivered_at) {
      await createOrderShipmentWorkflow(container).run({
        input: {
          order_id: order.id,
          fulfillment_id: f.id,
          items: (f.items ?? []).map((i: Row) => ({
            id: i.line_item_id,
            quantity: i.quantity,
          })),
          created_by: input.actor_id,
          no_notification: true,
        },
      })
      result.shipped++
    }
    if (!f.delivered_at) {
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({
        input: { orderId: order.id, fulfillmentId: f.id },
      })
      result.delivered++
    }
  }

  // 3. Plățile necapturate.
  const payments = (order.payment_collections ?? []).flatMap(
    (pc: Row) => pc?.payments ?? []
  )
  for (const p of payments) {
    if (!p || p.captured_at || p.canceled_at) continue
    await capturePaymentWorkflow(container).run({
      input: { payment_id: p.id, captured_by: input.actor_id },
    })
    result.capturedPayments++
  }

  if (result.shipped || result.delivered || result.capturedPayments) {
    logger.info(
      `[complete] ${tag}: ${result.shipped} expediate, ${result.delivered} livrate, ` +
        `${result.capturedPayments} plăți capturate.`
    )
  }

  // 4. Comanda.
  await completeOrderWorkflow(container).run({
    input: { orderIds: [order.id] },
  })
  return result
}
