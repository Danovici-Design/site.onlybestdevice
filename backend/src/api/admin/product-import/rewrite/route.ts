import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { rewriteDescription } from "../../../../lib/product-import/rewrite"

/**
 * Rescrie descrierea din previzualizare, pentru SEO.
 *
 *   POST /admin/product-import/rewrite
 *   { "title": "…", "brand": "Apple", "description_html": "<p>…</p>",
 *     "specs": [{ "label": "Memorie RAM", "value": "8 GB" }] }
 *
 * NU scrie nimic: întoarce textul rescris, titlul și meta descrierea, iar
 * operatorul alege în modal ce folosește. Scrierea rămâne a rutei `apply`.
 * Verificările (cifre, poze, cât a rămas copiat) sunt în `lib/product-import/rewrite.ts`.
 */

type Body = {
  title?: string
  brand?: string | null
  description_html?: string
  specs?: { label?: string; value?: string }[]
}

export const POST = async (req: MedusaRequest<Body>, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const body = req.body ?? {}

  const title = body.title?.trim()
  if (!title) {
    return res.status(400).json({ error: "`title` lipsește" })
  }

  const specs = (Array.isArray(body.specs) ? body.specs : [])
    .map((s) => ({ label: String(s?.label ?? "").trim(), value: String(s?.value ?? "").trim() }))
    .filter((s) => s.label && s.value)

  try {
    const result = await rewriteDescription({
      title,
      brand: body.brand ?? null,
      descriptionHtml: body.description_html ?? "",
      specs,
    })

    logger.info(
      `[product-import] rescriere „${title}": ${result.model}, ` +
        `${result.usage.input}+${result.usage.output} tokeni, ${result.warnings.length} avertismente.`
    )

    return res.json({
      model: result.model,
      description_html: result.descriptionHtml,
      seo_title: result.seoTitle,
      seo_description: result.seoDescription,
      warnings: result.warnings,
      notes: result.notes,
      usage: { input_tokens: result.usage.input, output_tokens: result.usage.output },
    })
  } catch (err) {
    const message = (err as Error).message
    logger.warn(`[product-import] rescriere eșuată pentru „${title}": ${message}`)
    return res.status(422).json({ error: message })
  }
}
