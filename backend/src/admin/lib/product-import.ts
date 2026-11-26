/**
 * Clientul modalului de import (vezi `src/api/admin/product-import/`).
 *
 * Ca la `product-description.ts` și `product-tags.ts`: `fetch` cu
 * `credentials: "include"`, nu SDK — rutele sunt ale noastre, iar SDK-ul
 * dashboard-ului n-are metode pentru ele.
 */

export type ImportedSpec = {
  /** Eticheta scrisă în pagina sursă. */
  sourceLabel: string
  /** Eticheta cu care s-ar scrie: canonica noastră, dacă a fost recunoscută. */
  label: string
  value: string
  group?: string
  known: boolean
  usage: number
}

export type ImportPreview = {
  url: string
  source: string
  source_label: string
  title: string | null
  brand: string | null
  ean: string | null
  mpn: string | null
  description: { html: string; text: string; chars: number; image_count: number }
  images: string[]
  specs: ImportedSpec[]
  vocabulary: string[]
  current: {
    title: string
    has_description: boolean
    description_chars: number
    specs: Record<string, string>
    image_count: number
  } | null
  /** Prezent doar dacă modelul a fost chemat (euristica scosese prea puțin). */
  ai: { model: string; input_tokens: number; output_tokens: number } | null
  /** Modelul e configurat pe server — doar atunci are sens „Rescrie pentru SEO". */
  ai_available: boolean
  notes: string[]
}

export type RewriteResult = {
  model: string
  /** Sanitizat pe server, cu URL-urile reale ale pozelor. */
  description_html: string
  seo_title: string
  seo_description: string
  /** Cifre care nu apar în sursă — rescrierea nu se bifează din start. */
  warnings: string[]
  notes: string[]
  usage: { input_tokens: number; output_tokens: number }
}

export const rewriteForSeo = (input: {
  title: string
  brand?: string | null
  description_html: string
  specs: { label: string; value: string }[]
}) => post<RewriteResult>("/admin/product-import/rewrite", input)

export class PreviewError extends Error {
  constructor(message: string, readonly canPasteHtml: boolean) {
    super(message)
    this.name = "PreviewError"
  }
}

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new PreviewError(
      data?.error || `Cererea a eșuat (${res.status})`,
      data?.can_paste_html !== false
    )
  }
  return data as T
}

export const fetchPreview = (input: {
  url: string
  html?: string
  product_id?: string
}) => post<ImportPreview>("/admin/product-import/preview", input)

export type ApplyReport = {
  description_updated: boolean
  specs_written: number
  images_added: number
  thumbnail_set: boolean
  seo_written: boolean
  failures: { url: string; reason: string }[]
}

export const applyImport = (input: {
  product_id: string
  source_url?: string
  description?: string
  specs?: Record<string, string>
  specs_mode?: "merge" | "replace"
  images?: string[]
  set_thumbnail?: boolean
  seo_title?: string
  seo_description?: string
}) => post<ApplyReport>("/admin/product-import/apply", input)
