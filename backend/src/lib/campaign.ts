/**
 * Titlul price list-ului campaniei curente — exact numele din Admin. Lista a
 * fost redenumită din „Black Weekend” în „Black Week” pe 23.11.2026; fără
 * aliniere aici, `/store/campaign` întorcea null și linkurile dispăreau. E contractul dintre lista din Admin,
 * `/store/campaign` (datele paginii) și pagina `/black-week` din storefront
 * (`CAMPAIGN.priceList` în `storefront/src/lib/util/campaign.ts`), care
 * listează produsele din ea. Redenumirea listei în Admin rupe legătura.
 */
export const CAMPAIGN_PRICE_LIST_TITLE = "Black Week"
