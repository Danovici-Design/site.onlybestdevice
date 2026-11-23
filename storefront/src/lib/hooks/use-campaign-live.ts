"use client"

import { useSyncExternalStore } from "react"

import {
  getCampaignPhase,
  parseCampaign,
  type CampaignDates,
  type CampaignPhase,
} from "@lib/util/campaign"

/** Plafonul lui `setTimeout`: peste el, timer-ul pornește imediat. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1
/** Cât de vechi pot fi datele până le cerem din nou la revenirea în pagină. */
const REFRESH_AFTER_MS = 5 * 60_000

type Snapshot = {
  /** Campania e în desfășurare (prețurile listei se aplică). */
  live: boolean
  /**
   * Linkurile din meniu se arată: din momentul în care lista e programată
   * (anunț, „începe pe…") până la final.
   */
  visible: boolean
  phase: CampaignPhase
  campaign: CampaignDates | null
}

const SERVER_SNAPSHOT: Snapshot = {
  live: false,
  visible: false,
  phase: "ended",
  campaign: null,
}

const listeners = new Set<() => void>()
let timer: number | undefined
let campaign: CampaignDates | null = null
let snapshot: Snapshot = SERVER_SNAPSHOT
let fetchedAt = 0
let inFlight = false

// Obiectul se schimbă doar când se schimbă ceva, altfel useSyncExternalStore
// ar re-randa la nesfârșit.
const recompute = () => {
  const phase = getCampaignPhase(campaign, Date.now())
  if (phase !== snapshot.phase || campaign !== snapshot.campaign) {
    snapshot = {
      live: phase === "live",
      visible: phase !== "ended",
      phase,
      campaign,
    }
  }
}

const notify = () => {
  recompute()
  listeners.forEach((listener) => listener())
  schedule()
}

// Toate linkurile împart un singur timer, până la următoarea limită a campaniei.
const schedule = () => {
  window.clearTimeout(timer)
  if (!campaign) return
  const now = Date.now()
  const next = [campaign.start, campaign.end + 1].find((t) => t > now)
  if (next !== undefined) {
    timer = window.setTimeout(notify, Math.min(next - now, MAX_TIMEOUT_MS))
  }
}

const load = () => {
  if (inFlight || Date.now() - fetchedAt < REFRESH_AFTER_MS) return
  inFlight = true
  fetch("/api/campaign")
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((body) => {
      campaign = parseCampaign(body?.campaign)
      fetchedAt = Date.now()
      notify()
    })
    // Fără date, linkurile rămân ascunse; reîncercăm la revenirea în pagină.
    .catch(() => {})
    .finally(() => {
      inFlight = false
    })
}

// Un timer lung nu supraviețuiește sigur somnului telefonului sau înghețării
// tab-ului, deci starea se recalculează (și datele se reîmprospătează) la
// revenirea în pagină.
const onWake = () => {
  load()
  notify()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)

  if (listeners.size === 1) {
    load()
    schedule()
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("pageshow", onWake)
  }

  return () => {
    listeners.delete(listener)

    if (listeners.size === 0) {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onWake)
      window.removeEventListener("pageshow", onWake)
    }
  }
}

/**
 * Spune dacă linkurile de campanie din meniu trebuie afișate (`visible`: de la
 * programarea listei până la final, deci și ca anunț înainte de start), faza
 * și datele campaniei (pentru textul cu perioada).
 *
 * Se decide doar în browser: nav-ul stă în layout-ul prerandat, deci o verificare
 * pe server ar rămâne înghețată până la următorul build. Datele vin din
 * `/api/campaign`, adică din price list-ul din Admin.
 */
export function useCampaignLive(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT)
}
