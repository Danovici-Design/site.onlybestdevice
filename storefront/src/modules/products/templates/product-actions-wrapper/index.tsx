import { listCartPaymentMethods } from "@lib/data/payment"
import { getOfferPeriods } from "@lib/data/offer-periods"
import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import type { GiftOffer } from "@lib/util/gifts"
import ProductActions from "@modules/products/components/product-actions"

/**
 * Fetches real time pricing for a product and renders the product actions component.
 */
export default async function ProductActionsWrapper({
  id,
  region,
  upgrades,
  warranty,
  services,
  gifts,
}: {
  id: string
  region: HttpTypes.StoreRegion
  upgrades?: HttpTypes.StoreProduct[]
  warranty?: HttpTypes.StoreProduct
  services?: HttpTypes.StoreProduct
  gifts?: GiftOffer[]
}) {
  const [product, paymentMethods, offerPeriods] = await Promise.all([
    listProducts({
      queryParams: { id: [id] },
      regionId: region.id,
    }).then(({ response }) => response.products[0]),
    // Aceeași sursă ca în coș și checkout: nota despre TBI din cardul de rate
    // se schimbă după cum providerul e activ sau nu pe regiune.
    listCartPaymentMethods(region.id),
    getOfferPeriods(id),
  ])

  if (!product) {
    return null
  }

  return (
    <ProductActions
      product={product}
      region={region}
      upgrades={upgrades}
      warranty={warranty}
      services={services}
      gifts={gifts}
      offerPeriods={offerPeriods}
      tbiAvailable={(paymentMethods ?? []).some((pm) =>
        pm.id.startsWith("pp_tbi")
      )}
    />
  )
}
