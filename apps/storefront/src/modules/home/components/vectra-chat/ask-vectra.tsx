import { sdk } from "@lib/config"
import { getCacheOptions } from "@lib/data/cookies"
import { getRegion } from "@lib/data/regions"
import { HttpTypes } from "@medusajs/types"
import VectraChat from "./index"

/**
 * Server loader for the Ask Vectra assistant.
 *
 * Mounted from the (main) layout so the assistant is available on every
 * storefront page except checkout, which lives in its own route group.
 * Fetches the catalog once; the chat joins backend search results against
 * it and renders them with the same ProductCard as the category pages.
 */

// This runs on EVERY page render, so unlike listProducts (deliberately
// no-store since #52) the catalog fetch here is cached and revalidated
// every 5 minutes: a slightly stale join list for chat cards is harmless,
// while re-fetching 100 products with calculated prices per navigation
// blocks the whole page and wrecks LCP.
async function listChatCatalog(regionId: string): Promise<HttpTypes.StoreProduct[]> {
  const next = {
    revalidate: 300,
    ...(await getCacheOptions("products")),
  }

  const { products } = await sdk.client.fetch<{ products: HttpTypes.StoreProduct[] }>(
    `/store/products`,
    {
      method: "GET",
      query: {
        // Full catalog (~80-100 products): the chat joins backend search
        // results against this list to build linked product cards.
        // Options are included so the filter panel can list the catalog's
        // categories and sizes.
        limit: 100,
        region_id: regionId,
        // NOTE: bare "categories" doesn't expand the relation in Medusa v2 —
        // it must be "categories.name" (or *categories) to get names back.
        fields:
          "id,title,handle,thumbnail,created_at,categories.name,collection,*variants.calculated_price,*options,*options.values",
      },
      next,
    }
  )

  return products
}

export default async function AskVectra({
  countryCode,
}: {
  countryCode: string
}) {
  const region = await getRegion(countryCode)
  if (!region) return null

  const products = await listChatCatalog(region.id).catch(
    () => [] as HttpTypes.StoreProduct[]
  )

  return <VectraChat products={products} />
}
