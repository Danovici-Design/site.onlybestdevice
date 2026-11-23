"use client"

import { CaretDown } from "@phosphor-icons/react/dist/ssr"
import { clx } from "@medusajs/ui"
import { useId, useState } from "react"

import { formatOfferPeriod, type OfferPeriod } from "@lib/util/offer-period"

/**
 * Mențiunea obligatorie la produsele la ofertă: „În limita stocului
 * disponibil". Perioada ofertei stă în spatele unui click, ca sub preț să
 * rămână un singur rând scurt.
 *
 * Fără perioadă (produs bifat „Ofertă specială" fără reducere, sau datele n-au
 * venit) mențiunea e text simplu, fără nimic de deschis.
 */
const OfferStockNotice = ({ period }: { period?: OfferPeriod | null }) => {
  const [open, setOpen] = useState(false)
  const id = useId()

  if (!period) {
    return (
      <p className="text-xs font-medium text-brand-dark/50">
        În limita stocului disponibil.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand-dark/50 underline decoration-dashed underline-offset-4 transition-colors hover:text-brand-dark"
      >
        În limita stocului disponibil
        <CaretDown
          size={11}
          weight="bold"
          aria-hidden
          className={clx("transition-transform", open && "rotate-180")}
        />
      </button>
      <p id={id} hidden={!open} className="text-xs text-brand-dark/70">
        {formatOfferPeriod(period)}
      </p>
    </div>
  )
}

export default OfferStockNotice
