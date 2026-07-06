import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import CategoryGrid from "@modules/home/components/category-grid"
import ProductRail from "@modules/home/components/featured-products/product-rail"
import Lookbook from "@modules/home/components/lookbook"
import Banner from "@modules/home/components/banner"
import Newsletter from "@modules/home/components/newsletter"
import { listCollections } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "VECTRA - Essential Sportswear",
  description:
    "Essential sportswear. Clean design, honest materials. Shop running shoes, training apparel, outdoor gear and accessories.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  const [region, { collections }] = await Promise.all([
    getRegion(countryCode),
    listCollections({ fields: "id, handle, title" }),
  ])

  if (!region) return null

  return (
    <>
      <Hero />
      <CategoryGrid />

      {/* Featured rails — one per collection, fallback if none */}
      {collections?.length > 0 ? (
        collections.map((collection) => (
          <ProductRail key={collection.id} collection={collection} region={region} />
        ))
      ) : (
        <ProductRail region={region} />
      )}

      <Banner />
      <Lookbook regionId={region.id} />
      <Newsletter />
    </>
  )
}
