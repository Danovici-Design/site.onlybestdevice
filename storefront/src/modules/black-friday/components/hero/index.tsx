"use client"

import { ArrowDown } from "@phosphor-icons/react/dist/ssr"
import { useEffect, useState } from "react"

import {
  CAMPAIGN,
  formatCampaignDates,
  formatCampaignStart,
  getCampaignPhase,
  type CampaignDates,
} from "@lib/util/campaign"

const UNITS = [
  { label: "zile", ms: 86_400_000 },
  { label: "ore", ms: 3_600_000 },
  { label: "minute", ms: 60_000 },
  { label: "secunde", ms: 1_000 },
]

const remainingUnits = (ms: number) => {
  let rest = Math.max(0, ms)
  return UNITS.map(({ label, ms: size }) => {
    const value = Math.floor(rest / size)
    rest -= value * size
    return { label, value: String(value).padStart(2, "0") }
  })
}

const lead = (phase: string, campaign: CampaignDates | null) =>
  phase === "upcoming" && campaign
    ? `Reducerile încep pe ${formatCampaignStart(campaign)}.`
    : phase === "live" && campaign
      ? `Reduceri la telefoane, laptopuri și accesorii, ${formatCampaignDates(campaign)}.`
      : "Campania s-a încheiat."

/**
 * `now` vine de pe server, ca prima randare din browser să fie identică cu HTML
 * primit; ceasul real preia după hidratare. Faza se recalculează la fiecare
 * secundă, deci pagina lăsată deschisă trece singură la „Se termină în".
 */
const BlackFridayHero = ({
  now: serverNow,
  campaign,
}: {
  now: number
  /** Din price list-ul campaniei; `null` = fără campanie programată. */
  campaign: CampaignDates | null
}) => {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const phase = getCampaignPhase(campaign, now)
  const target = !campaign ? now : phase === "upcoming" ? campaign.start : campaign.end

  return (
    <section className="bf-hero">
      <h1 className="bf-display bf-wordmark">
        {CAMPAIGN.name.split(" ")[0]}
        <br />
        {CAMPAIGN.name.split(" ").slice(1).join(" ")}
      </h1>

      <div className="bf-hero-footer">
        <div>
          <p className="bf-lead">{lead(phase, campaign)}</p>
          {/* Butonul coboară mereu în pagina asta, la secțiunea #oferte: produsele
              campaniei cât ține, altfel mesajul cu data de start. Nu trimite pe
              /oferte — acolo e altă selecție decât cea anunțată aici. */}
          <a href="#oferte" className="bf-cta">
            Vezi ofertele
            <span className="bf-cta-icon">
              <ArrowDown size={20} weight="bold" aria-hidden />
            </span>
          </a>
        </div>

        {phase !== "ended" && (
          <div>
            <p className="bf-countdown-label">
              {phase === "upcoming" ? "Începe în" : "Se termină în"}
            </p>
            {/* Fără aria-live: un cititor de ecran ar anunța fiecare secundă. */}
            <dl className="bf-countdown" role="timer">
              {remainingUnits(target - now).map(({ label, value }) => (
                <div key={label}>
                  <dd className="bf-display">{value}</dd>
                  <dt>{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  )
}

export default BlackFridayHero
