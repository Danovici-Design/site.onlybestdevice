import { defineRouteConfig } from "@medusajs/admin-sdk"

import ProductExplorer from "../../components/product-explorer"

/**
 * „Oferte" sub Produse: aceeași listă ca pagina „Produse” (filtre, căutare,
 * acțiuni în masă), restrânsă la ce apare pe /oferte. Taburile despart
 * selecția echipei (bifa „Ofertă specială”) de produsele intrate automat prin
 * prețul promoțional — regula e în `/admin/product-filters/explore` (`offers`).
 */
const OffersPage = () => <ProductExplorer offers />

export const config = defineRouteConfig({
  label: "Oferte",
  nested: "/products",
})

export default OffersPage
