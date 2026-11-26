/**
 * Rescrierea descrierii importate, pentru SEO.
 *
 * De ce: descrierea copiată de pe eMAG e același text pe zeci de site-uri.
 * Google afișează o singură copie (de obicei pe eMAG), deci pagina noastră nu
 * câștigă nimic din ea. Rescrierea dă un text propriu, în română, plus titlul și
 * meta descrierea pe care le citește storefront-ul (`metadata.seo_title` /
 * `metadata.seo_description`, vezi `storefront/src/lib/util/seo.ts`).
 *
 * ═══ Regula care ține feature-ul onest ═══
 *
 * Extragerea (`ai.ts`) cere „copiezi, nu compui". Aici e invers: modelul
 * compune, deci verificările se mută pe FAPTE, nu pe fraze:
 *
 *  - **cifrele**: orice număr din textul rescris trebuie să existe în sursă
 *    (descriere, fișă, titlu). Un „5000 mAh" inventat e exact eroarea care
 *    costă un retur. Ce nu se regăsește se întoarce în `warnings`, iar modalul
 *    nu bifează rescrierea din start;
 *  - **pozele**: modelul nu vede URL-uri, ci jetoane `IMG_1…IMG_n`. Le mutăm
 *    noi înapoi pe URL-urile reale; un jeton necunoscut dispare. Așa modelul nu
 *    poate strica sau inventa o adresă;
 *  - **copierea**: dacă prea multe propoziții lungi au rămas identice cu sursa,
 *    rescrierea nu și-a făcut treaba — notă pentru operator.
 *
 * Totul trece apoi prin `sanitizeWooHtml`, ca orice descriere din baza noastră.
 */
import Anthropic from "@anthropic-ai/sdk"

import { hasVisibleContent, htmlToText, sanitizeWooHtml, stripEmptyBlocks } from "../woo-description"
import { aiExtractionEnabled, DEFAULT_MODEL, groundKey } from "./ai"

/** Peste atât, descrierea sursă nu mai e o descriere de produs. */
const MAX_SOURCE_CHARS = 200_000
const MAX_OUTPUT_TOKENS = 64_000
const REQUEST_TIMEOUT_MS = 240_000

/** Ținta din `seo.ts`: titlul + „ | Onlybestdevice" (17) sub ~65 de caractere. */
const SEO_TITLE_MAX = 48
const SEO_DESCRIPTION_RANGE = [120, 160] as const

export type RewriteInput = {
  title: string
  brand?: string | null
  descriptionHtml: string
  specs: { label: string; value: string }[]
}

export type RewriteResult = {
  model: string
  /** HTML sanitizat, cu URL-urile reale ale pozelor. */
  descriptionHtml: string
  seoTitle: string
  seoDescription: string
  /** Probleme de fond: cifre care nu apar în sursă. Modalul nu bifează rescrierea. */
  warnings: string[]
  /** Observații: lungimi SEO, poze scoase, text prea apropiat de original. */
  notes: string[]
  usage: { input: number; output: number }
}

type ModelOutput = {
  description_html: string
  seo_title: string
  seo_description: string
  notes: string[]
}

const SCHEMA = {
  type: "object",
  properties: {
    description_html: {
      type: "string",
      description:
        "Descrierea rescrisă, HTML simplu: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <img src=\"IMG_n\">.",
    },
    seo_title: {
      type: "string",
      description: `Titlul paginii pentru Google, cel mult ${SEO_TITLE_MAX} de caractere, fără numele magazinului.`,
    },
    seo_description: {
      type: "string",
      description: `Meta descrierea, ${SEO_DESCRIPTION_RANGE[0]}–${SEO_DESCRIPTION_RANGE[1]} de caractere.`,
    },
    notes: {
      type: "array",
      items: { type: "string" },
      description: "Observații scurte pentru operator (ex. sursa avea prea puține informații).",
    },
  },
  required: ["description_html", "seo_title", "seo_description", "notes"],
  additionalProperties: false,
} as const

const SYSTEM = `Scrii descrieri de produs pentru Onlybestdevice, un magazin online de telefoane, tablete și electronice din România.

Primești descrierea unui produs copiată de pe alt site și fișa lui tehnică. Scrii o descriere nouă, a magazinului nostru, pe care Google să n-o considere o copie.

Faptele:
- Folosești DOAR informațiile din descriere, din fișă și din titlu. Nu adaugi nimic din ce știi tu despre produs: nicio specificație, cifră, accesoriu sau funcție care nu apare în sursă.
- Fiecare cifră pe care o scrii trebuie să apară și în sursă. Dacă sursa nu dă o valoare, nu o pomenești.
- Nu scrii despre preț, livrare, garanție, stoc, promoții sau despre alte magazine. Le afișează pagina separat, iar condițiile se schimbă.

Textul:
- Română corectă, cu diacritice (ș, ț cu virgulă). Ton clar și concret, pentru cineva care alege între două modele. Fără superlative goale („cel mai bun", „revoluționar"), dacă nu sunt fapte din sursă.
- Formulezi cu cuvintele tale. Nu copia propoziții din sursă; reorganizează informația pe ce contează la cumpărare.
- Structură: un paragraf de deschidere de 2–3 propoziții, apoi secțiuni cu <h2> pe teme (ecran, performanță, cameră, baterie etc., doar cele care au conținut în sursă), cu paragrafe scurte sau liste. Fără titlul produsului ca <h1>.
- Lungimea urmează sursa: o sursă săracă dă o descriere scurtă. Nu umple.

Pozele:
- Pozele din sursă apar ca <img src="IMG_n">. Le poți păstra, ca <img src="IMG_n"> cu același jeton, lângă secțiunea despre care vorbesc. Nu inventezi jetoane și nu scrii URL-uri.

SEO:
- seo_title: numele produsului cum îl caută oamenii (marcă, model, memorie, culoare), cel mult ${SEO_TITLE_MAX} de caractere. Fără numele magazinului: se adaugă automat.
- seo_description: ${SEO_DESCRIPTION_RANGE[0]}–${SEO_DESCRIPTION_RANGE[1]} de caractere, 1–2 propoziții cu ce face produsul diferit, din fapte din sursă.`

/** Înlocuiește pozele cu jetoane scurte; întoarce harta jeton → tag original. */
export function tokenizeImages(html: string): { html: string; images: Map<string, string> } {
  const images = new Map<string, string>()
  let n = 0
  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const token = `IMG_${++n}`
    images.set(token, tag)
    return `<img src="${token}">`
  })
  return { html: out, images }
}

/** Pune la loc tagurile originale; jetoanele necunoscute dispar. */
export function restoreImages(html: string, images: Map<string, string>) {
  let dropped = 0
  const used = new Set<string>()
  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const token = /\bsrc\s*=\s*["']?(IMG_\d+)/i.exec(tag)?.[1]
    const original = token ? images.get(token) : undefined
    if (!original || used.has(token!)) {
      dropped++
      return ""
    }
    used.add(token!)
    return original
  })
  return { html: out, dropped }
}

/**
 * Cifrele din text care nu apar în sursă.
 *
 * Pe cheia normalizată (`groundKey`), deci „6,1" și „6.1" sunt același lucru
 * („6 1"). Comparăm numărul întreg ca token, nu ca subșir: „12" nu trebuie să
 * treacă doar pentru că sursa conține „128".
 */
export function ungroundedNumbers(text: string, sourceKey: string): string[] {
  // „128gb", „a14" sunt un singur token după `groundKey`; despărțim cifrele de
  // litere, altfel „128 GB" din textul rescris n-ar găsi „128GB" din fișă.
  const split = sourceKey.replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2")
  const sourceTokens = new Set(split.split(" "))
  const sourcePadded = ` ${split} `
  const missing = new Set<string>()
  for (const match of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const key = groundKey(match[0])
    // Un număr compus („6 1") se caută ca secvență; unul simplu, ca token.
    const found = key.includes(" ") ? sourcePadded.includes(` ${key} `) : sourceTokens.has(key)
    if (!found) missing.add(match[0])
  }
  return [...missing]
}

/** Cât din textul rescris a rămas identic cu sursa (propoziții peste 40 de caractere). */
export function copiedShare(text: string, sourceKey: string): number {
  const sentences = text
    .split(/[.!?\n]+/)
    .map(groundKey)
    .filter((s) => s.length > 40)
  if (!sentences.length) return 0
  return sentences.filter((s) => sourceKey.includes(s)).length / sentences.length
}

const textOf = (message: { content: { type: string }[] }): string =>
  message.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")

export async function rewriteDescription(input: RewriteInput): Promise<RewriteResult> {
  if (!aiExtractionEnabled()) {
    throw new Error("Rescrierea cu AI nu e configurată (ANTHROPIC_API_KEY).")
  }
  if (!htmlToText(input.descriptionHtml).trim() && !input.specs.length) {
    throw new Error("N-avem din ce rescrie: produsul n-are nici descriere, nici fișă tehnică.")
  }
  if (input.descriptionHtml.length > MAX_SOURCE_CHARS) {
    throw new Error("Descrierea sursă e prea lungă pentru rescriere.")
  }

  const model = process.env.PRODUCT_IMPORT_AI_MODEL || DEFAULT_MODEL
  const { html: tokenized, images } = tokenizeImages(input.descriptionHtml)
  const specsText = input.specs.map((s) => `${s.label}: ${s.value}`).join("\n")

  const client = new Anthropic({ maxRetries: 1, timeout: REQUEST_TIMEOUT_MS })
  const stream = client.beta.messages.stream({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    // La un refuz, API-ul reia cererea singur pe un model de rezervă.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `<titlu>${input.title}</titlu>\n` +
          (input.brand ? `<marca>${input.brand}</marca>\n` : "") +
          `<fisa_tehnica>\n${specsText || "(lipsă)"}\n</fisa_tehnica>\n` +
          `<descriere_sursa>\n${tokenized || "(lipsă)"}\n</descriere_sursa>`,
      },
    ],
  })

  const message = await stream.finalMessage()

  if (message.stop_reason === "refusal") {
    throw new Error(`Modelul a refuzat rescrierea (${message.stop_details?.category ?? "necunoscut"}).`)
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(`Răspunsul modelului s-a oprit la plafonul de ${MAX_OUTPUT_TOKENS} tokeni.`)
  }

  let parsed: ModelOutput
  try {
    parsed = JSON.parse(textOf(message))
  } catch (err) {
    throw new Error(`Răspunsul modelului nu e JSON valid: ${(err as Error).message}`)
  }

  const notes = Array.isArray(parsed.notes) ? parsed.notes.filter((n) => typeof n === "string") : []
  const warnings: string[] = []

  const restored = restoreImages(parsed.description_html ?? "", images)
  if (restored.dropped) notes.push(`${restored.dropped} poze cu jeton necunoscut au fost scoase.`)

  const sanitized = sanitizeWooHtml(restored.html, { allowLinks: false })
  const descriptionHtml = hasVisibleContent(sanitized.html) ? stripEmptyBlocks(sanitized.html) : ""
  if (!descriptionHtml) throw new Error("Modelul a întors o descriere goală.")

  const seoTitle = (parsed.seo_title ?? "").trim()
  const seoDescription = (parsed.seo_description ?? "").trim()

  // Sursa faptelor: tot ce a primit modelul.
  const sourceKey = groundKey(
    [input.title, input.brand ?? "", htmlToText(input.descriptionHtml), specsText].join(" ")
  )

  const invented = ungroundedNumbers(
    [htmlToText(descriptionHtml), seoTitle, seoDescription].join(" "),
    sourceKey
  )
  if (invented.length) {
    warnings.push(
      `Cifre care nu apar în sursă: ${invented.slice(0, 8).join(", ")}${invented.length > 8 ? "…" : ""}. ` +
        "Verifică-le înainte să folosești textul."
    )
  }

  const copied = copiedShare(htmlToText(descriptionHtml), sourceKey)
  if (copied > 0.3) {
    notes.push(`${Math.round(copied * 100)}% din propozițiile lungi au rămas identice cu sursa.`)
  }
  if (seoTitle.length > SEO_TITLE_MAX) {
    notes.push(`Titlul SEO are ${seoTitle.length} caractere (ținta: cel mult ${SEO_TITLE_MAX}).`)
  }
  if (
    seoDescription.length < SEO_DESCRIPTION_RANGE[0] ||
    seoDescription.length > SEO_DESCRIPTION_RANGE[1]
  ) {
    notes.push(
      `Meta descrierea are ${seoDescription.length} caractere (ținta: ${SEO_DESCRIPTION_RANGE.join("–")}).`
    )
  }

  return {
    model: message.model,
    descriptionHtml,
    seoTitle,
    seoDescription,
    warnings,
    notes,
    usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
  }
}
