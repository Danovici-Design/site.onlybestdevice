import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bankAccounts } from "../../../lib/company/bank-account"

/**
 * Conturile pe care clientul virează comenzile cu ordin de plată. Le afișează
 * pagina de confirmare a comenzii.
 *
 * Datele sunt publice: oricum le trimitem pe email oricui plasează o comandă.
 * Fără `BANK_IBAN*` configurat răspunde `{ accounts: [] }`, iar storefront-ul
 * nu afișează niciun cont. Mai bine nimic decât un IBAN inventat.
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({ accounts: bankAccounts() })
}
