import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  cancelOrderFulfillmentWorkflow,
  cancelOrderWorkflow,
} from "@medusajs/core-flows"

type FulfillmentRow = {
  id: string
  canceled_at: string | Date | null
  shipped_at: string | Date | null
  delivered_at: string | Date | null
}

/**
 * Anulează o comandă cu tot ce are pe ea: întâi livrările rămase active, apoi
 * comanda.
 *
 * `cancelOrderWorkflow` refuză („All fulfillments must be canceled before
 * canceling an order”) cât timp există o livrare neanulată, iar operatorul nu
 * vede în admin care a rămas — o comandă poate avea mai multe livrări, iar
 * cele marcate „expediat”/„livrat” nu au deloc butonul de anulare: Medusa le
 * refuză („Shipped fulfillments cannot be canceled”).
 *
 * Pentru cele expediate/livrate scoatem întâi data de expediere/livrare, apoi
 * rulăm anularea normală. Cazul real e coletul refuzat sau întors: marfa e
 * înapoi în depozit, deci restocarea pe care o face anularea livrării e
 * corectă. Providerul e cel manual, deci anularea nu atinge vreun AWB.
 *
 * `shipped_quantity` de pe linii rămâne cum era (modulul de comenzi nu-l
 * expune la scriere); pe o comandă anulată nu mai contează la nimic.
 */
export async function cancelOrderFully(
  container: MedusaContainer,
  input: { order_id: string; canceled_by?: string }
): Promise<{ canceledFulfillments: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "fulfillments.id",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
    ],
    filters: { id: input.order_id },
  })

  const order = data?.[0] as unknown as
    | { id: string; display_id?: number; fulfillments?: FulfillmentRow[] }
    | undefined
  if (!order) {
    // Lăsăm workflow-ul să dea eroarea standard de „nu există”.
    await cancelOrderWorkflow(container).run({ input })
    return { canceledFulfillments: 0 }
  }

  const active = (order.fulfillments ?? []).filter((f) => f && !f.canceled_at)

  for (const f of active) {
    if (f.shipped_at || f.delivered_at) {
      await fulfillmentModule.updateFulfillment(f.id, {
        shipped_at: null,
        delivered_at: null,
      })
      logger.info(
        `[cancel] #${order.display_id ?? order.id}: livrarea ${f.id} era ` +
          `${f.delivered_at ? "livrată" : "expediată"} — scot data ca s-o pot anula.`
      )
    }

    await cancelOrderFulfillmentWorkflow(container).run({
      input: { order_id: order.id, fulfillment_id: f.id, no_notification: true },
    })
    logger.info(`[cancel] #${order.display_id ?? order.id}: livrarea ${f.id} anulată.`)
  }

  await cancelOrderWorkflow(container).run({ input })
  return { canceledFulfillments: active.length }
}
