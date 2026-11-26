/**
 * Conturile bancare pe care se încasează comenzile lăsate pe ordin de plată.
 *
 * Le afișăm pe toate: clientul alege contul din banca lui, iar transferul în
 * aceeași bancă intră pe loc, nu a doua zi lucrătoare.
 *
 * Env, numerotat ca primul cont să rămână compatibil cu configurația veche:
 *   BANK_IBAN   / BANK_NAME     — primul cont
 *   BANK_IBAN_2 / BANK_NAME_2   — al doilea
 *   …până la BANK_IBAN_9
 *   BANK_HOLDER                 — beneficiarul, comun (implicit denumirea firmei)
 *
 * Citite din env la fiecare apel, nu la import: providerul Resend se încarcă
 * odată cu modulele Medusa, iar o citire la import ar putea prinde env-ul
 * neîncărcat complet. E același motiv ca la `locale()` din templates.
 *
 * Nu are valori implicite. Un IBAN vechi rămas în cod e mai rău decât unul
 * lipsă: banii ar pleca într-un cont închis, iar clientul ar afla abia când
 * sună să întrebe de colet. Din același motiv, un IBAN cu cifra de control
 * greșită (o greșeală de tastare în env) e sărit, nu afișat. Fără niciun cont
 * valid, emailul de virament nu se trimite deloc — vezi verificarea din
 * `POST /admin/orders/:id/status`.
 */
import { isValidIban, normalizeIban } from "../buyback/iban"

export type BankAccount = {
  iban: string
  name: string
  holder: string
}

/** Denumirea societății, oglindește LEGAL din modules/resend/templates. */
const LEGAL = "ONLY BEST DEVICE S.R.L."

const MAX_ACCOUNTS = 9

const clean = (value?: string) => (value ?? "").trim()

const suffix = (index: number) => (index === 1 ? "" : `_${index}`)

/**
 * Conturile configurate, în ordinea din env. Listă goală dacă nu e niciunul.
 *
 * Doar IBAN-ul e obligatoriu: banca și beneficiarul sunt informative pentru
 * client (transferul se face pe IBAN), deci au valori de rezervă. Golurile din
 * numerotare sunt permise, ca un cont să poată fi scos fără să le renumerotezi
 * pe celelalte.
 */
export const bankAccounts = (): BankAccount[] => {
  const holder = clean(process.env.BANK_HOLDER) || LEGAL
  const accounts: BankAccount[] = []
  const seen = new Set<string>()

  for (let i = 1; i <= MAX_ACCOUNTS; i++) {
    const raw = clean(process.env[`BANK_IBAN${suffix(i)}`])
    if (!raw) continue

    const iban = normalizeIban(raw)
    if (!isValidIban(iban)) {
      console.warn(
        `[bank-account] BANK_IBAN${suffix(i)} are cifra de control greșită — contul nu se afișează.`
      )
      continue
    }
    if (seen.has(iban)) continue
    seen.add(iban)

    accounts.push({
      iban,
      name: clean(process.env[`BANK_NAME${suffix(i)}`]),
      holder,
    })
  }

  return accounts
}

/** Primul cont, sau `null`. Pentru locurile care au loc de un singur cont. */
export const bankAccount = (): BankAccount | null => bankAccounts()[0] ?? null

export const hasBankAccount = () => bankAccounts().length > 0
