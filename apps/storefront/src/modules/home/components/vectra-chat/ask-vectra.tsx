import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { convertToLocale } from "@lib/util/money"
import VectraChat, { ChatProduct } from "./index"

/**
 * Server loader for the Ask Vectra assistant.
 *
 * Mounted from the (main) layout so the assistant is available on every
 * storefront page except checkout, which lives in its own route group.
 * Fetches the catalog once and builds the lightweight product list the
 * chat UI needs.
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
          "id,title,handle,thumbnail,categories,collection,*variants.calculated_price",
      },
    }).catch(() => null),
  ])

  if (!region) return null

  const products: ChatProduct[] = (
    productsData?.response?.products ?? []
  ).map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle ?? "",
    price:
      p.variants?.[0]?.calculated_price?.calculated_amount != null
        ? convertToLocale({
            amount: p.variants[0].calculated_price.calculated_amount as number,
            currency_code: region.currency_code ?? "usd",
            minimumFractionDigits: 0,
          })
        : "",
    thumbnail: p.thumbnail ?? null,
    category: p.collection?.title ?? p.categories?.[0]?.name ?? "",
  }))

  return <VectraChat products={products} />
}
