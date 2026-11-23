/**
 * Titlul price list-ului campaniei curente. Pe site campania se numește
 * „Black Week”, dar lista din Admin a rămas „Black Weekend”. E contractul dintre lista din Admin,
 * `/store/campaign` (datele paginii) și pagina `/black-week` din storefront
 * (`CAMPAIGN.priceList` în `storefront/src/lib/util/campaign.ts`), care
 * listează produsele din ea. Redenumirea listei în Admin rupe legătura.
 */
export const CAMPAIGN_PRICE_LIST_TITLE = "Black Weekend"
