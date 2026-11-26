"use server"

import { sdk } from "@lib/config"

export type BankAccountDTO = {
  iban: string
  name: string
  holder: string
}

/**
 * Conturile pentru ordinul de plată, din env-ul backend-ului (`BANK_IBAN*`).
 *
 * Fără cache: pagina de confirmare se deschide rar, iar un IBAN schimbat
 * trebuie să apară imediat, nu după expirarea vreunui cache.
 */
export const getBankAccounts = async (): Promise<BankAccountDTO[]> => {
  try {
    const { accounts } = await sdk.client.fetch<{
      accounts?: BankAccountDTO[]
    }>(`/store/bank-account`, { method: "GET", cache: "no-store" })
    return accounts ?? []
  } catch (err) {
    console.error("[getBankAccounts] failed to fetch /store/bank-account", err)
    return []
  }
}
