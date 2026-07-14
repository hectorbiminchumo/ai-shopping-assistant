import { HttpTypes } from "@medusajs/types"
import { getProductPrice } from "./get-product-price"

// Filters for the category-page product grid, carried as query params
// (minPrice, maxPrice, size) and applied in-memory before pagination.
export type GridFilters = {
  priceMin?: number
  priceMax?: number
  size?: string
}

export function hasActiveGridFilters(
  filters?: GridFilters
): filters is GridFilters {
  return (
    !!filters &&
    (filters.priceMin !== undefined ||
      filters.priceMax !== undefined ||
      !!filters.size)
  )
}

// Price is compared against the cheapest variant's calculated price (major
// units). Size matches the product's "Size" option values, so products need
// the *options,*options.values fields.
export function matchesGridFilters(
  product: HttpTypes.StoreProduct,
  filters: GridFilters
): boolean {
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    const price = getProductPrice({ product }).cheapestPrice
      ?.calculated_price_number
    if (price === undefined || price === null) return false
    if (filters.priceMin !== undefined && price < filters.priceMin) return false
    if (filters.priceMax !== undefined && price > filters.priceMax) return false
  }

  if (filters.size) {
    const sizeOption = product.options?.find(
      (o) => o.title?.toLowerCase() === "size"
    )
    if (!sizeOption?.values?.some((v) => v.value === filters.size)) return false
  }

  return true
}
