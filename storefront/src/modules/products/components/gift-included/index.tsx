import { GiftOffer } from "@lib/util/gifts"
import { convertToLocale } from "@lib/util/money"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { Gift } from "@phosphor-icons/react/dist/ssr"

type GiftIncludedProps = {
  gifts: GiftOffer[]
}

/**
 * Caseta „Primești cadou" de pe pagina produsului.
 *
 * Stă imediat sub preț, nu lângă butonul de coș: cadoul face parte din ofertă
 * (prețul + ce primești), nu e o opțiune de bifat ca garanția. Nu se alege
 * nimic aici — backend-ul pune singur cadoul în coș odată cu produsul.
 * Valoarea tăiată e prețul de azi al cadoului, ca „economisești" să fie cinstit.
 */
const GiftIncluded = ({ gifts }: GiftIncludedProps) => {
  if (!gifts.length) return null

  const total = gifts.reduce((sum, g) => sum + (g.value ?? 0), 0)
  const currency = gifts[0].currencyCode

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-emerald-600/25 bg-gradient-to-br from-emerald-50 to-white"
      data-testid="gift-included"
    >
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"
          aria-hidden
        >
          <Gift size={18} weight="fill" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-extrabold text-brand-dark leading-tight">
            {gifts.length > 1 ? "Primești cadouri" : "Primești cadou"}
          </span>
          {total > 0 && (
            <span className="block text-xs font-bold text-emerald-700 leading-tight mt-0.5">
              în valoare de{" "}
              {convertToLocale({ amount: total, currency_code: currency })}
            </span>
          )}
        </span>
      </div>

      <ul className="flex flex-col gap-2 px-4 pb-3">
        {gifts.map((g) => {
          const body = (
            <>
              <span className="w-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-brand-dark/[0.07]">
                <Thumbnail thumbnail={g.thumbnail} size="square" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-brand-dark leading-snug line-clamp-2">
                  {g.title}
                </span>
                {g.variantTitle && (
                  <span className="block text-xs text-brand-dark/55 leading-tight">
                    {g.variantTitle}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end leading-tight">
                {g.value ? (
                  <span className="text-xs text-brand-dark/40 line-through tabular-nums">
                    {convertToLocale({
                      amount: g.value,
                      currency_code: g.currencyCode,
                    })}
                  </span>
                ) : null}
                <span className="text-sm font-extrabold uppercase tracking-wide text-emerald-700">
                  Gratuit
                </span>
              </span>
            </>
          )
          return (
            <li key={g.variantId}>
              {g.productHandle ? (
                <LocalizedClientLink
                  href={`/products/${g.productHandle}`}
                  className="flex items-center gap-3 rounded-xl bg-white/70 p-2 ring-1 ring-inset ring-emerald-600/10 transition-colors hover:ring-emerald-600/30"
                >
                  {body}
                </LocalizedClientLink>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-white/70 p-2 ring-1 ring-inset ring-emerald-600/10">
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="border-t border-emerald-600/10 px-4 py-2 text-xs text-brand-dark/60">
        Se adaugă automat în coș, împreună cu produsul. În limita stocului.
      </p>
    </div>
  )
}

export default GiftIncluded
