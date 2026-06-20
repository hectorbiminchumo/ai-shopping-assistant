/**
 * Thin alias kept for backwards compatibility with existing imports.
 * All new usage should import ProductCard directly.
 */
import { HttpTypes } from "@medusajs/types"
import ProductCard from "@modules/products/components/product-card"

export default function ProductPreview({
  product,
  region,
  isFeatured: _isFeatured,
}: {
  product: HttpTypes.StoreProduct
  region?: HttpTypes.StoreRegion
  isFeatured?: boolean
}) {
  return <ProductCard product={product} region={region} />
}
