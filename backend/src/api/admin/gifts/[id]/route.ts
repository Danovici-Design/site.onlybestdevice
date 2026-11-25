import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { MAX_GIFTS, readGiftCard, writeGiftConfig } from "../../../../lib/gifts"

/**
 * Cardul „Cadou inclus" din admin: bifa și cadourile legate de produs. Vezi
 * `lib/gifts.ts` pentru cum se comportă cadoul în coș.
 */

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1),
        variant_id: z.string().min(1),
      })
    )
    .max(MAX_GIFTS)
    .optional(),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await readGiftCard(req.scope, req.params.id))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = UpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message })
  }
  await writeGiftConfig(req.scope, req.params.id, parsed.data as any)
  res.json(await readGiftCard(req.scope, req.params.id))
}
