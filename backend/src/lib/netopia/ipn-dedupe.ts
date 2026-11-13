/**
 * Un IPN Netopia e o retrimitere a unuia deja procesat?
 *
 * `ntpID` identifică TRANZACȚIA, nu rezultatul ei: pe pagina Netopia clientul
 * poate reîncerca un card refuzat în aceeași tranzacție, iar IPN-ul de succes
 * vine cu același `ntpID` ca eșecul de dinainte (la fel o autorizare 3DS
 * `paid_pending` urmată de `confirmed`). Comanda #419 (12.11.2026) a pierdut
 * așa confirmarea unei plăți de 6.237 lei: gardul compara doar id-ul, a socotit
 * succesul o repetare a eșecului și a răspuns „OK” fără să captureze.
 *
 * Excepția e intenționat îngustă: pe același `ntpID` trec DOAR statusurile în
 * care banii au intrat — `confirmed` și `underpaid` (încasat mai puțin, nu se
 * capturează, doar se consemnează) — și doar o dată fiecare. Orice
 * alt status repetat pe aceeași tranzacție rămâne blocat ca înainte — un
 * „expirat” întârziat al unei încercări vechi nu trebuie să anuleze comanda
 * pe care clientul o plătește chiar acum.
 */
const MONEY_IN = new Set(["confirmed", "underpaid"])

export const isDuplicateIpn = (
  netopiaMeta: Record<string, any> | null | undefined,
  paymentId: string | null,
  action: string
): boolean => {
  if (!paymentId || netopiaMeta?.last_payment_id !== paymentId) return false
  if (!MONEY_IN.has(action)) return true
  return netopiaMeta?.last_payment_action === action
}
