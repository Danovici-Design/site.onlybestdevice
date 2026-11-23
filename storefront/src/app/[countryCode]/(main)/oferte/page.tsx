import { Metadata } from "next"
import { canonical } from "@lib/util/canonical"

import { parseSelectedFilters } from "@lib/util/product-filters"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"

export const metadata: Metadata = {
  title: "Oferte telefoane, laptopuri și accesorii",
  description:
    "Telefoane, laptopuri, tablete și accesorii la preț redus, cu garanție 24 de luni și plată cu cardul sau în rate. Toate produsele aflate acum la ofertă.",
  alternates: canonical("/oferte"),
}

type Params = {
  searchParams: Promise<{
    sortBy?: SortOptions
    page?: string
    brand?: string
    storage?: string
    ram?: string
    color?: string
    price?: string
  }>
  params: Promise<{
    countryCode: string
  }>
}

/**
 * Lista ofertelor curente.
 *
 * Produsele bifate „Ofertă specială" în admin (tagul `oferta`) care au și o
 * reducere în vigoare. Regula e în ruta `/store/catalog` (`sale=true`).
 */
export default async function OffersPage(props: Params) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { sortBy, page } = searchParams
  const filters = parseSelectedFilters(searchParams)

  return (
    <StoreTemplate
      sale
      sortBy={sortBy}
      page={page}
      countryCode={params.countryCode}
      filters={filters}
    />
  )
}
