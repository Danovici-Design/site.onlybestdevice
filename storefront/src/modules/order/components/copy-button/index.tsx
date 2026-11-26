"use client"

import { useState } from "react"

/**
 * Copiază textul exact (IBAN-ul fără spații), nu ce se vede pe ecran:
 * afișăm IBAN-ul grupat câte 4 ca să fie lizibil, dar unele aplicații de
 * banking refuză spațiile la lipire.
 */
export default function CopyButton({
  value,
  label = "Copiază",
}: {
  value: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-full border border-brand-dark/[0.15] px-3 py-1 text-xs font-medium text-brand-dark hover:bg-brand-dark/[0.05] transition-colors"
      aria-label={`${label}: ${value}`}
    >
      {copied ? "Copiat ✓" : label}
    </button>
  )
}
