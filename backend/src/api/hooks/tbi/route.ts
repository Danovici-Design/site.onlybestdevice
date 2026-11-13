import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  cancelOrderWorkflow,
  capturePaymentWorkflow,
} from '@medusajs/core-flows'
import {
  ContainerRegistrationKeys,
  Modules,
} from '@medusajs/framework/utils'
import { getTbiClient } from '../../../modules/tbi-pay/client'
import { isTbiOrder, sendTbiAlert } from '../../../lib/tbi/submit-application'

/**
 * Callback-ul de statusuri TBI (ReturnToProvider). TBI trimite un POST cu
 * `order_data` = JSON criptat cu cheia publică a comerciantului:
 *
 *   { "order_id": "145003523", "status_id": "0|1|2", "motiv": "..." }
 *
 *   - 1 → aprobat  → capturăm plata, comanda se livrează
 *   - 0 → respins/anulat → anulăm comanda (motiv: „Respins Biroul de
 *         Credit" / „Criterii eligibilitate" / gol la anulare)
 *   - 2 → pending  → consemnăm statusul intermediar, nu facem nimic
 *
 * `order_id` e display_id-ul comenzii (trimis de noi la Finalize).
 */

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  const expected = process.env.TBI_CALLBACK_TOKEN
  if (!expected) {
    // Un callback acceptat necondiționat poate captura plăți sau anula
    // comenzi, deci pe producție refuzăm categoric. Pe uat doar avertizăm,
    // ca testele să nu se blocheze pe o variabilă lipsă.
    if ((process.env.TBI_ENV || 'uat') === 'live') {
      logger.error(
        '[tbi] TBI_CALLBACK_TOKEN lipsește pe live — callback respins. Setează variabila și repornește.'
      )
      return res.status(503).json({ received: false, error: 'callback token not configured' })
    }
    logger.warn('[tbi] TBI_CALLBACK_TOKEN nesetat — callback acceptat neverificat (doar uat)')
  } else {
    const got = (req.query.token as string) || req.headers['x-callback-token']
    if (got !== expected) {
      logger.warn('[tbi] Callback cu token invalid — ignorat')
      return res.status(401).json({ received: false })
    }
  }

  // order_data poate veni ca form-urlencoded sau JSON.
  const raw =
    (req.body as any)?.order_data ?? (req.body as any)?.orderData ?? null
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ received: false, error: 'order_data lipsește' })
  }

  let payload: { order_id?: string; status_id?: string; motiv?: string }
  try {
    payload = JSON.parse(getTbiClient().decrypt(raw))
  } catch (e: any) {
    logger.error(`[tbi] Callback nedecriptabil: ${e?.message}`)
    return res.status(400).json({ received: false, error: 'decrypt failed' })
  }

  const displayId = Number(payload.order_id)
  const statusId = String(payload.status_id ?? '')
  logger.info(
    `[tbi] Callback: order=${displayId} status_id=${statusId} motiv=${payload.motiv ?? '-'}`
  )

  if (!displayId || !['0', '1', '2'].includes(statusId)) {
    return res
      .status(400)
      .json({ received: false, error: 'order_id sau status_id invalid' })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: 'order',
    fields: [
      'id',
      'display_id',
      'status',
      'canceled_at',
      'email',
      'total',
      'currency_code',
      'shipping_address.first_name',
      'shipping_address.last_name',
      'shipping_address.phone',
      'metadata',
      'payment_collections.payments.id',
      'payment_collections.payments.captured_at',
      'payment_collections.payment_sessions.provider_id',
    ],
    // Tipurile query.graph declară display_id ca string, dar valoarea reală
    // e numerică.
    filters: { display_id: displayId as unknown as string },
  })

  const order = orders?.[0]
  if (!order) {
    logger.warn(`[tbi] Callback pentru comandă inexistentă: #${displayId}`)
    return res.status(404).json({ received: false, error: 'order not found' })
  }

  if (!isTbiOrder(order)) {
    return res
      .status(400)
      .json({ received: false, error: 'order is not financed via TBI' })
  }

  const statusName =
    statusId === '1' ? 'approved' : statusId === '2' ? 'pending' : 'rejected'

  // Idempotență: același status final primit de două ori nu re-execută nimic.
  const meta = (order.metadata ?? {}) as Record<string, any>
  if (meta.tbi?.status === statusName && statusName !== 'pending') {
    return res.json({ received: true, duplicate: true })
  }

  const orderModule = req.scope.resolve(Modules.ORDER)
  const receivedAt = new Date().toISOString()
  const saveStatus = (extra: Record<string, any> = {}) =>
    // Doar cheia `tbi`: Medusa face merge pe primul nivel al metadata, iar
    // restul (ex. `emails`) poate fi scris în paralel de alți subscriberi.
    orderModule.updateOrders(order.id, {
      metadata: {
        tbi: {
          ...(meta.tbi ?? {}),
          status: statusName,
          motiv: payload.motiv ?? meta.tbi?.motiv,
          status_received_at: receivedAt,
          // Fiecare callback suprascrie `status`, deci fără istoric un
          // „respins” urmat de „pending” dispare fără urmă (comanda #412).
          history: [
            ...(Array.isArray(meta.tbi?.history) ? meta.tbi.history : []),
            { status: statusName, motiv: payload.motiv ?? null, at: receivedAt },
          ].slice(-10),
          ...extra,
        },
      },
    })

  /**
   * Dosarul a mers mai departe după ce comanda a fost anulată (#412: „respins”
   * la 15:51, apoi „pending” și aprobare). Medusa nu reactivează o comandă
   * anulată, iar captura pe o plată anulată ar arunca — TBI ar reîncerca la
   * nesfârșit și nimeni n-ar afla. Consemnăm, alertăm o dată per status și
   * răspundem 200; decizia (livrăm sau anulăm dosarul la TBI) e a omului.
   */
  if (order.status === 'canceled' || order.canceled_at) {
    const alerted: string[] = Array.isArray(meta.tbi?.late_alerts)
      ? meta.tbi.late_alerts
      : []
    const shouldAlert = statusName !== 'rejected' && !alerted.includes(statusName)
    logger.error(
      `[tbi] Callback „${statusName}” pentru comanda ANULATĂ #${displayId} — nu capturăm, verifică manual.`
    )
    await saveStatus(
      shouldAlert ? { late_alerts: [...alerted, statusName] } : {}
    )
    if (shouldAlert) {
      await sendTbiAlert(req.scope, {
        kind: 'late_after_cancel',
        order,
        details: {
          error: statusName === 'approved' ? 'aprobat' : 'în analiză',
          attempts: Number(meta.tbi?.attempts ?? 0),
        },
      })
    }
    return res.json({ received: true, order_canceled: true })
  }

  if (statusName === 'approved') {
    const payment = (order.payment_collections ?? [])
      .flatMap((pc: any) => pc?.payments ?? [])
      .find((p: any) => p?.id)
    if (payment && !payment.captured_at) {
      // Intenționat înaintea salvării statusului: dacă `capture` aruncă,
      // răspundem 5xx fără să marcăm „approved”, deci TBI poate reîncerca.
      await capturePaymentWorkflow(req.scope).run({
        input: { payment_id: payment.id },
      })
    } else if (!payment) {
      logger.error(
        `[tbi] Comanda ${order.id} aprobată de TBI, dar nu are payment de capturat — verifică manual.`
      )
    }
    await saveStatus()
  } else if (statusName === 'rejected') {
    // Statusul se scrie ÎNAINTE de anulare: `order.canceled` declanșează
    // subscriber-ul care retrage cererea la TBI, iar el trebuie să vadă că
    // cererea e deja respinsă, ca să nu o mai retrimită.
    await saveStatus()
    try {
      await cancelOrderWorkflow(req.scope).run({
        input: { order_id: order.id },
      })
    } catch (e: any) {
      logger.warn(
        `[tbi] Comanda ${order.id} nu a putut fi anulată automat: ${e?.message}`
      )
    }
  } else {
    await saveStatus()
  }

  res.json({ received: true })
}
