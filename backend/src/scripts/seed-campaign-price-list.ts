/**
 * Creează price list-ul gol al campaniei („Black Weekend”), programat pe
 * perioada ei.
 *
 * După rulare, operatorul adaugă doar produsele și prețurile, din Admin >
 * Liste de prețuri > Black Weekend. Prețurile intră și ies singure la datele
 * listei, iar produsele din ea apar singure pe /black-week cât timp lista e
 * în desfășurare. Datele se pot muta apoi direct din Admin: pagina le citește
 * din listă (`/store/campaign`), nu din cod.
 *
 * Lista rămâne `active` de la creare: `active` plus `starts_at` în viitor
 * înseamnă „programată”. Pe `draft` prețurile nu s-ar aplica la start, iar jobul
 * `price-list-revalidate` ar ignora lista.
 *
 * Titlul vine din `lib/campaign.ts`. Offsetul e explicit, +02:00 e ora României
 * iarna.
 *
 * Idempotent: dacă lista există deja, nu scrie nimic — datele mutate între timp
 * din Admin rămân cum le-a pus operatorul. Cu FORCE_DATES=1 le readuce la cele
 * de aici. Prețurile adăugate de operator nu sunt atinse.
 *
 * Rulare locală:  cd backend && yarn medusa exec ./src/scripts/seed-campaign-price-list.ts
 * Rulare pe prod: docker exec <container-backend> npx medusa exec ./src/scripts/seed-campaign-price-list.js
 *   Opțional: DRY_RUN=1 (doar raport, fără scriere)
 *
 * Nu cere revalidarea storefront-ului: când începe lista, jobul o face singur.
 * Dacă mutarea datelor o face să înceapă sau să se termine pe loc, cheamă
 * manual `/api/revalidate`, pentru că `medusa exec` n-o face.
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createPriceListsWorkflow,
  updatePriceListsWorkflow,
} from "@medusajs/medusa/core-flows"

import { CAMPAIGN_PRICE_LIST_TITLE } from "../lib/campaign"

const TITLE = CAMPAIGN_PRICE_LIST_TITLE
const DESCRIPTION = "Reducerile de Black Weekend."
const STARTS_AT = "2026-11-27T00:00:00+02:00"
const ENDS_AT = "2026-11-29T23:59:59+02:00"

const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? "")
const FORCE_DATES = /^(1|true|yes)$/i.test(process.env.FORCE_DATES ?? "")

const sameMoment = (a: string | Date | null | undefined, b: string) =>
  !!a && new Date(a).getTime() === new Date(b).getTime()

export default async function seedCampaignPriceList({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: lists } = await query.graph({
    entity: "price_list",
    fields: ["id", "title", "status", "starts_at", "ends_at"],
    filters: { title: TITLE },
  })

  const existing = lists?.[0] as any
  if (existing) {
    const scheduled =
      sameMoment(existing.starts_at, STARTS_AT) &&
      sameMoment(existing.ends_at, ENDS_AT)

    if (existing.status !== "active") {
      logger.warn(`Lista e „${existing.status}”. Treci-o pe „active” din Admin.`)
    }
    if (scheduled || !FORCE_DATES) {
      logger.info(
        `Lista „${TITLE}” există deja (${existing.starts_at} – ${existing.ends_at}). Nu scriu nimic${
          scheduled ? "" : "; FORCE_DATES=1 o readuce la datele din script"
        }.`
      )
      return
    }
    if (DRY_RUN) {
      logger.info(
        `[dry-run] Aș muta lista „${TITLE}” de la ${existing.starts_at} – ${existing.ends_at} la ${STARTS_AT} – ${ENDS_AT}.`
      )
      return
    }

    await updatePriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            id: existing.id,
            description: DESCRIPTION,
            starts_at: STARTS_AT,
            ends_at: ENDS_AT,
          },
        ],
      },
    })
    logger.info(`Gata: lista „${TITLE}” mutată la ${STARTS_AT} – ${ENDS_AT}.`)
    return
  }

  if (DRY_RUN) {
    logger.info(`[dry-run] Aș crea lista „${TITLE}”, ${STARTS_AT} – ${ENDS_AT}.`)
    return
  }

  const { result } = await createPriceListsWorkflow(container).run({
    input: {
      price_lists_data: [
        {
          title: TITLE,
          description: DESCRIPTION,
          type: "sale",
          status: "active",
          starts_at: STARTS_AT,
          ends_at: ENDS_AT,
          prices: [],
        },
      ] as any,
    },
  })

  logger.info(
    `Gata: lista „${TITLE}” (${(result as any[])[0].id}), ${STARTS_AT} – ${ENDS_AT}.`
  )
}
