import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createProductTagsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Pune și scoate taguri pe mai multe produse, cu O SINGURĂ scriere per produs.
 *
 * Fiecare `updateProductsWorkflow` emite `product.updated`, iar abonatul de
 * revalidare golește cache-uri globale pe Vercel (vezi memoria „Cost Vercel:
 * ISR Writes”). Două apeluri separate (scoate un tag, apoi pune altul) ar
 * dubla revalidările — de aceea setul final se calculează aici, o dată.
 *
 * Valorile se compară fără diferență de majuscule, ca peste tot unde se citesc
 * tagurile (`LOWER(t.value)` în SQL, `hasTag` în admin și storefront): un tag
 * importat „Oferta” trebuie scos la fel ca „oferta”.
 *
 * Întoarce id-urile produselor chiar modificate.
 */
export const updateProductTags = async (
  container: any,
  productIds: string[],
  { add = [], remove = [] }: { add?: string[]; remove?: string[] }
): Promise<string[]> => {
  if (!productIds.length) return []
  const knex: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const addIds = await Promise.all(add.map((v) => resolveTagId(container, v)))
  const removeValues = new Set(remove.map((v) => v.toLowerCase()))

  const links: { product_id: string; tag_id: string; value: string }[] = await knex("product_tags as pt")
    .join("product_tag as t", "t.id", "pt.product_tag_id")
    .whereNull("t.deleted_at")
    .whereIn("pt.product_id", productIds)
    .select("pt.product_id", "t.id as tag_id", "t.value")

  const current = new Map<string, { id: string; value: string }[]>(productIds.map((id) => [id, []]))
  for (const l of links) current.get(l.product_id)?.push({ id: l.tag_id, value: l.value })

  const products = productIds.flatMap((id) => {
    const before = current.get(id)!
    const kept = before.filter((t) => !removeValues.has((t.value ?? "").toLowerCase()))
    const after = new Set(kept.map((t) => t.id))
    for (const tagId of addIds) after.add(tagId)

    const beforeIds = new Set(before.map((t) => t.id))
    const same = after.size === beforeIds.size && [...after].every((t) => beforeIds.has(t))
    return same ? [] : [{ id, tag_ids: [...after] }]
  })

  if (products.length) {
    await updateProductsWorkflow(container).run({
      input: {
        products: products.map((p) => ({ id: p.id, tags: p.tag_ids.map((t) => ({ id: t })) })),
      } as any,
    })
  }
  return products.map((p) => p.id)
}

/** Id-ul tagului (fără diferență de majuscule), creat dacă lipsește. */
const resolveTagId = async (container: any, value: string): Promise<string> => {
  const knex: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const row = await knex("product_tag")
    .first("id")
    .whereRaw("LOWER(value) = ?", [value.toLowerCase()])
    .whereNull("deleted_at")
    .orderBy("created_at", "asc")
  if (row?.id) return row.id

  const { result } = await createProductTagsWorkflow(container).run({
    input: { product_tags: [{ value }] },
  })
  return (result as any)[0].id
}
