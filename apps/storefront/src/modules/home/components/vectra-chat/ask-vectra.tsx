import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import VectraChat from "./index"

/**
 * Server loader for the Ask Vectra assistant.
 *
 * Mounted from the (main) layout so the assistant is available on every
 * storefront page except checkout, which lives in its own route group.
 * Fetches the catalog once; the chat joins backend search results against
 * it and renders them with the same ProductCard as the category pages.
 */
export default async function AskVectra({
  countryCode,
}: {
  countryCode: string
}) {
  const [region, productsData] = await Promise.all([
    getRegion(countryCode),
    listProducts({
      countryCode,
      queryParams: {
        // Full catalog (~80-100 products): the chat joins backend search
        // results against this list to build linked product cards.
        limit: 100,
        fields:
          "id,title,handle,thumbnail,created_at,categories,collection,*variants.calculated_price",
      },
    }).catch(() => null),
  ])

  if (!region) return null

  return <VectraChat products={productsData?.response?.products ?? []} />
}
