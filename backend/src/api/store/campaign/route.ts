import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { CAMPAIGN_PRICE_LIST_TITLE } from "../../../lib/campaign"

/**
 * GET /store/campaign
 *
 * Datele campaniei (Black Weekend), citite din price list-ul ei. Storefront-ul
 * își ia de aici numărătoarea, textul cu perioada și momentul în care apar
 * linkurile din meniu — deci mutarea datelor din Admin > Liste de prețuri e
 * suficientă, fără deploy.
 *
 * `campaign: null` când lista lipsește, e ștearsă sau nu e `active` (o listă
 * `draft` nu-și aplică prețurile, deci nici pagina n-are ce arăta).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const knex: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const row = await knex("price_list")
    .first("title", "starts_at", "ends_at")
    .where({ title: CAMPAIGN_PRICE_LIST_TITLE, type: "sale", status: "active" })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")

  res.setHeader("Cache-Control", "public, max-age=60")
  res.json({
    campaign:
      row && row.starts_at && row.ends_at
        ? {
            title: row.title,
            starts_at: new Date(row.starts_at).toISOString(),
            ends_at: new Date(row.ends_at).toISOString(),
          }
        : null,
  })
}
