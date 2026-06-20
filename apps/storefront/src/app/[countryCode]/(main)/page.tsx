import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import CategoryGrid from "@modules/home/components/category-grid"
import FeaturedProducts from "@modules/home/components/featured-products"
import Lookbook from "@modules/home/components/lookbook"
import Banner from "@modules/home/components/banner"
import Newsletter from "@modules/home/components/newsletter"
import VectraChat, { ChatProduct } from "@modules/home/components/vectra-chat"
import { listCollections } from "@lib/data/collections"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "VECTRA — Essential Sportswear",
  description:
    "Essential sportswear. Clean design, honest materials. Shop running shoes, training apparel, outdoor gear and accessories.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  const [region, { collections }, productsData] = await Promise.all([
    getRegion(countryCode),
    listCollections({ fields: "id, handle, title" }),
    listProducts({
      queryParams: {
        limit: 20,
        fields:
          "id,title,handle,thumbnail,categories,collection,*variants.calculated_price",
      },
    }).catch(() => null),
  ])

  if (!region) return null

  const chatProducts: ChatProduct[] = (
    productsData?.response?.products ?? []
  ).map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle ?? "",
    price:
      p.variants?.[0]?.calculated_price?.calculated_amount != null
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: region.currency_code?.toUpperCase() ?? "USD",
            minimumFractionDigits: 0,
          }).format(
            (p.variants[0].calculated_price.calculated_amount as number) / 100
          )
        : "",
    thumbnail: p.thumbnail ?? null,
    category:
      p.collection?.title ??
      p.categories?.[0]?.name ??
      "",
  }))

  return (
    <>
      <Hero />
      <CategoryGrid />
      {collections?.length > 0 && (
        <div>
          {collections.map((collection) => (
            <FeaturedProducts
              key={collection.id}
              collections={[collection]}
              region={region}
            />
          ))}
        </div>
      )}
      <Lookbook regionId={region.id} />
      <Banner />
      <Newsletter />
      <VectraChat products={chatProducts} />
    </>
  )
}
