import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { cancelOrderFully } from "../../../../../lib/orders/cancel-order-fully"

/**
 * Înlocuiește ruta nativă `POST /admin/orders/:id/cancel` (butonul „Cancel”
 * din meniul comenzii), ca să anuleze singură livrările rămase înainte de
 * comandă. Răspunsul e același ca la ruta nativă: `{ order }` cu câmpurile
 * cerute de dashboard (middleware-ul nativ pune `queryConfig` și aici).
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  await cancelOrderFully(req.scope, {
    order_id: req.params.id,
    canceled_by: req.auth_context?.actor_id,
  })

  const { data } = await query.graph({
    entity: "order",
    fields: req.queryConfig?.fields ?? ["id", "status"],
    filters: { id: req.params.id },
  })

  res.status(200).json({ order: data[0] })
}
