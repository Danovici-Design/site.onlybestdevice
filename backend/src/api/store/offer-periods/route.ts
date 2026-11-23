import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { liveSalePricesSql } from "../../../lib/discounted-products"
import { resolveCurrencyCode } from "../../../lib/currency"

const QuerySchema = z.object({ product_id: z.string().min(1).max(64) })

/**
 * GET /store/offer-periods?product_id=…
 *
 * Perioada reducerii în vigoare pentru fiecare variantă a produsului, pentru
 * mențiunea de pe pagina produsului („Ofertă valabilă …, în limita stocului
 * disponibil" — anunțurile de reducere trebuie să spună perioada).
 *
 * `starts_at`: începutul listei, sau — la listele fără dată (ex. „Reduceri") —
 * ziua în care s-a pus prețul promoțional. `ends_at`: finalul listei, sau null.
 * Aceleași rânduri ca `/oferte` (`liveSalePricesSql`); la două liste pe aceeași
 * variantă câștigă prețul mai mic, ca la Medusa.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ message: "product_id lipsește" })
  }
  const knex: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const currency = await resolveCurrencyCode(req.scope)

  const rows: {
    variant_id: string
    amount: string
    price_created_at: Date
    list_starts_at: Date | null
    list_ends_at: Date | null
  }[] = (
    await knex.raw(
      `SELECT live.* FROM (${liveSalePricesSql}) live
       WHERE live.product_id = :product_id
       ORDER BY live.amount ASC`,
      { currency, product_id: parsed.data.product_id }
    )
  ).rows

  const periods: Record<string, { starts_at: string; ends_at: string | null }> = {}
  for (const r of rows) {
    if (periods[r.variant_id]) continue // primul = prețul cel mai mic
    periods[r.variant_id] = {
      starts_at: new Date(r.list_starts_at ?? r.price_created_at).toISOString(),
      ends_at: r.list_ends_at ? new Date(r.list_ends_at).toISOString() : null,
    }
  }

  res.json({ periods })
}
