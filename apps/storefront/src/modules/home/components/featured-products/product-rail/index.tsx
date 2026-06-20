import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import RailSection from "@modules/common/components/rail-section"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      fields: "*variants.calculated_price",
    },
  })

  if (!products?.length) return null

  return (
    <RailSection
      eyebrow="Selection"
      title={collection.title}
      viewAllHref={`/collections/${collection.handle}`}
    >
      {products.map((product) => (
        <li
          key={product.id}
          className="shrink-0"
          style={{
            flex: "0 0 calc((100% - 66px) / 4)",
            scrollSnapAlign: "start",
            minWidth: 200,
          }}
        >
          <ProductPreview product={product} region={region} isFeatured />
        </li>
      ))}
    </RailSection>
  )
}
