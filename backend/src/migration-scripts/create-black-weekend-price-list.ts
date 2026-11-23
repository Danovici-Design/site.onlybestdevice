import type { ExecArgs } from "@medusajs/framework/types"

import seedCampaignPriceList from "../scripts/seed-campaign-price-list"

/**
 * Creează lista de prețuri „Black Weekend” (27–29 noiembrie 2026) la primul
 * `db:migrate` — pe prod, la pornirea containerului (`RUN_MIGRATIONS`), deci
 * lista apare singură la deploy, fără `medusa exec` rulat de mână.
 *
 * Medusa o rulează O SINGURĂ DATĂ (tabelul `script_migrations`). Dacă lista
 * există deja, nu scrie nimic: datele mutate din Admin rămân cum sunt.
 * Logica e în `scripts/seed-campaign-price-list.ts`, care rămâne și de rulat
 * manual (de ex. cu FORCE_DATES=1).
 */
export default async function createBlackWeekendPriceList(args: ExecArgs) {
  await seedCampaignPriceList(args)
}
