"use server"

import { sdk } from "@lib/config"
import { parseCampaign, type CampaignDates } from "@lib/util/campaign"

/**
 * Datele campaniei, din price list-ul ei (`/store/campaign`).
 *
 * Cache 5 minute: schimbarea datelor unei price list nu emite niciun eveniment
 * (vezi `price-list-revalidate`), deci o mutare din Admin ajunge pe site după
 * cel mult atât. Aruncă la eroare — apelantul decide (pagina cade pe „încheiat",
 * ruta `/api/campaign` lasă CDN-ul să servească răspunsul vechi).
 */
export const getCampaign = async (): Promise<CampaignDates | null> => {
  const { campaign } = await sdk.client.fetch<{
    campaign: { starts_at: string; ends_at: string } | null
  }>(`/store/campaign`, {
    method: "GET",
    next: { revalidate: 300, tags: ["campaign"] },
    cache: "force-cache",
  })
  return parseCampaign(campaign)
}
