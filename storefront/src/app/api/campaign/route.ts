import { NextResponse } from "next/server"

import { getCampaign } from "@lib/data/campaign"

/**
 * Datele campaniei pentru linkurile din meniu (top-bar, nav, drawer, bara de
 * jos), cerute din browser de `useCampaignLive`.
 *
 * Dinamică, nu prerandată: altfel build-ul ar depinde de încă un apel la API,
 * iar build-urile pică deja când backend-ul repornește (vezi memoria „Ordinea
 * de deploy”). CDN-ul o ține 5 minute, deci backend-ul vede cel mult o cerere
 * la 5 minute, oricâți vizitatori ar fi.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const campaign = await getCampaign()
    return NextResponse.json(
      {
        campaign: campaign
          ? {
              starts_at: new Date(campaign.start).toISOString(),
              ends_at: new Date(campaign.end).toISOString(),
            }
          : null,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    )
  } catch {
    // Fără cache: o eroare trecătoare nu trebuie să ascundă campania 5 minute.
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}
