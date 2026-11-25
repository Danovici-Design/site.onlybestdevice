import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Gift, MagnifyingGlass, XMark } from "@medusajs/icons"
import { AdminProduct, DetailWidgetProps } from "@medusajs/types"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Skeleton,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { ReactNode, useEffect, useRef, useState } from "react"

import { useOptionalQueryClient } from "../lib/use-optional-query-client"

/**
 * Cardul „Cadou inclus": bifa „Vine cu cadou" + produsele-cadou (husă, folie…).
 *
 * Cadoul intră singur în coș odată cu produsul, gratuit, cu prețul lui tăiat;
 * pe pagina produsului apare caseta „Primești cadou". Se alege o variantă
 * anume (husa neagră, nu „husa"), pentru că din ea scade stocul la comandă.
 * Logica stă în `backend/src/lib/gifts.ts`.
 */

const SERVICE_HANDLES = ["garantie-extinsa", "servicii-second-hand"]
const MAX_GIFTS = 5

type GiftItem = { product_id: string; variant_id: string }
type GiftDetails = GiftItem & {
  product_title: string
  product_handle: string | null
  variant_title: string | null
  sku: string | null
  thumbnail: string | null
  value: number | null
  missing: boolean
}
type Card = { enabled: boolean; items: GiftItem[]; gifts: GiftDetails[] }

type SearchVariant = {
  id: string
  title: string | null
  sku: string | null
}
type SearchProduct = {
  id: string
  title: string
  thumbnail: string | null
  variants: SearchVariant[]
}

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(
    amount
  )

const request = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message || `Eroare ${res.status}`)
  return body
}

const Thumb = ({ src }: { src: string | null }) =>
  src ? (
    <img
      src={src}
      alt=""
      className="h-10 w-10 shrink-0 rounded-md border border-ui-border-base object-cover"
    />
  ) : (
    <span className="h-10 w-10 shrink-0 rounded-md border border-ui-border-base bg-ui-bg-subtle" />
  )

const ProductGiftWidget = ({
  data: product,
}: DetailWidgetProps<AdminProduct>): ReactNode => {
  const queryClient = useOptionalQueryClient()
  const [card, setCard] = useState<Card | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [term, setTerm] = useState("")
  const [results, setResults] = useState<SearchProduct[]>([])
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)

  useEffect(() => {
    request(`/admin/gifts/${product.id}`)
      .then(setCard)
      .catch((e) => setError(e.message))
  }, [product.id])

  // Căutarea pornește la 300ms după ultima tastă; răspunsurile vechi, sosite
  // după unul mai nou, se ignoră.
  useEffect(() => {
    const q = term.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({
          q,
          limit: "8",
          fields: "id,title,handle,thumbnail,variants.id,variants.title,variants.sku",
        })
        const body = await request(`/admin/products?${params}`)
        if (seq !== searchSeq.current) return
        setResults(
          ((body.products ?? []) as SearchProduct[]).filter(
            (p) =>
              p.id !== product.id &&
              !SERVICE_HANDLES.includes((p as any).handle ?? "")
          )
        )
      } catch (e: any) {
        if (seq === searchSeq.current) toast.error(e.message)
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [term, product.id])

  if (SERVICE_HANDLES.includes(product.handle ?? "")) return null

  const save = async (patch: Partial<Pick<Card, "enabled" | "items">>, ok: string) => {
    setBusy(true)
    try {
      const body = await request(`/admin/gifts/${product.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      setCard(body)
      toast.success(ok)
      queryClient?.invalidateQueries({ queryKey: ["products"] })
      return true
    } catch (e: any) {
      toast.error(e.message || "Eroare la salvare")
      return false
    } finally {
      setBusy(false)
    }
  }

  const items = card?.items ?? []
  const chosen = new Set(items.map((i) => i.variant_id))

  const add = async (p: SearchProduct, v: SearchVariant) => {
    if (chosen.has(v.id)) return
    const saved = await save(
      { items: [...items, { product_id: p.id, variant_id: v.id }] },
      "Cadou adăugat"
    )
    if (saved) {
      setTerm("")
      setResults([])
    }
  }

  const remove = (variantId: string) =>
    save(
      { items: items.filter((i) => i.variant_id !== variantId) },
      "Cadou scos"
    )

  const enabled = !!card?.enabled
  const warnNoGifts = enabled && card && card.gifts.length === 0

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start gap-3 px-6 py-4">
        <span className="text-ui-fg-subtle mt-0.5">
          <Gift />
        </span>
        <div className="flex-1 min-w-0">
          <label htmlFor="gift-toggle" className="cursor-pointer">
            <Heading level="h2">Vine cu cadou</Heading>
          </label>
          <Text size="small" className="text-ui-fg-subtle">
            Cadoul intră automat în coș, gratuit, cu prețul lui tăiat.
          </Text>
        </div>
        <Switch
          id="gift-toggle"
          checked={enabled}
          disabled={!card || busy}
          onCheckedChange={(next) =>
            save(
              { enabled: next },
              next ? "Cadoul e activ pe produs" : "Cadoul a fost oprit"
            )
          }
          className="mt-1 shrink-0"
        />
      </div>

      {error && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </div>
      )}

      {!card && !error && (
        <div className="px-6 py-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {card && (enabled || card.gifts.length > 0) && (
        <div className="flex flex-col gap-3 px-6 py-4">
          {!enabled && (
            <Text size="small" className="text-ui-fg-subtle">
              Cadourile de mai jos sunt păstrate, dar nu se oferă cât timp bifa e
              oprită.
            </Text>
          )}
          {warnNoGifts && (
            <Text size="small" className="text-ui-fg-error">
              Bifa e pusă, dar n-ai ales niciun cadou — pe site nu apare nimic.
            </Text>
          )}

          {card.gifts.map((g) => (
            <div key={g.variant_id} className="flex items-center gap-3">
              <Thumb src={g.thumbnail} />
              <div className="flex-1 min-w-0">
                <Text size="small" weight="plus" className="truncate">
                  {g.missing ? "Produs șters din catalog" : g.product_title}
                </Text>
                <Text size="xsmall" className="text-ui-fg-subtle truncate">
                  {[
                    g.variant_title,
                    g.sku,
                    g.value != null ? `valoare ${formatMoney(g.value)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "fără preț"}
                </Text>
              </div>
              {g.missing && <Badge color="red" size="2xsmall">lipsă</Badge>}
              <Button
                size="small"
                variant="transparent"
                disabled={busy}
                onClick={() => remove(g.variant_id)}
                aria-label="Scoate cadoul"
              >
                <XMark />
              </Button>
            </div>
          ))}

          {items.length < MAX_GIFTS ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-fg-muted">
                  <MagnifyingGlass />
                </span>
                <Input
                  size="small"
                  className="pl-8"
                  placeholder="Caută cadoul: husă, folie, încărcător…"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  disabled={busy}
                />
              </div>
              {searching && <Skeleton className="h-10 w-full" />}
              {!searching && term.trim().length >= 2 && results.length === 0 && (
                <Text size="small" className="text-ui-fg-subtle">
                  Niciun produs găsit.
                </Text>
              )}
              {!searching &&
                results.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-1 rounded-md border border-ui-border-base p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Thumb src={p.thumbnail} />
                      <Text size="small" weight="plus" className="line-clamp-2">
                        {p.title}
                      </Text>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(p.variants ?? []).map((v) => (
                        <Button
                          key={v.id}
                          size="small"
                          variant="secondary"
                          disabled={busy || chosen.has(v.id)}
                          onClick={() => add(p, v)}
                        >
                          {chosen.has(v.id) ? "✓ " : "+ "}
                          {v.title && v.title !== p.title
                            ? v.title
                            : "Alege"}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              Maximum {MAX_GIFTS} cadouri pe produs.
            </Text>
          )}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.before",
})

export default ProductGiftWidget
