import { giftLineValue, giftTargetTitle } from "@lib/util/gifts"
import { convertToLocale } from "@lib/util/money"
import { clx } from "@medusajs/ui"
import { Gift } from "@phosphor-icons/react/dist/ssr"

type Line = {
  metadata?: Record<string, unknown> | null
  compare_at_unit_price?: number | null
  quantity?: number | null
}

/**
 * Eticheta de pe linia de cadou din coș / comandă: „Cadou · la iPhone 15".
 * Cadoul are poză și link (e un produs real), dar fără etichetă ar arăta ca o
 * husă pusă din greșeală în coș.
 */
export const GiftBadge = ({
  item,
  className,
}: {
  item: Line
  className?: string
}) => {
  const target = giftTargetTitle(item)
  return (
    <span
      className={clx(
        "inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs",
        className
      )}
    >
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold uppercase tracking-wider text-[10px] text-emerald-700">
        <Gift size={12} weight="fill" />
        Cadou
      </span>
      {target && <span className="text-brand-dark/55">la {target}</span>}
    </span>
  )
}

/** Prețul liniei de cadou: valoarea tăiată și „Gratuit". */
export const GiftPrice = ({
  item,
  currencyCode,
  className,
}: {
  item: Line
  currencyCode: string
  className?: string
}) => {
  const value = giftLineValue(item)
  return (
    <span className={clx("flex flex-col items-end leading-tight", className)}>
      {value && (
        <span
          className="text-xs text-brand-dark/40 line-through tabular-nums"
          data-testid="gift-original-price"
        >
          {convertToLocale({ amount: value, currency_code: currencyCode })}
        </span>
      )}
      <span className="text-sm font-extrabold text-emerald-700">Gratuit</span>
    </span>
  )
}

/**
 * Pe linia produsului: ce cadou vine cu el. Cadoul stă imediat dedesubt, dar
 * pe produs se vede primul — e motivul pentru care l-au ales.
 */
export const GiftIncludedNote = ({ titles }: { titles: string[] }) => {
  if (!titles.length) return null
  return (
    <span className="inline-flex items-start gap-1.5 text-xs font-bold text-emerald-700">
      <Gift size={14} weight="fill" className="mt-px shrink-0" />
      <span>Include cadou: {titles.join(", ")}</span>
    </span>
  )
}
