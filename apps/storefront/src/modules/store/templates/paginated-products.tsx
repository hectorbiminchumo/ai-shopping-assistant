import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { GridFilters, hasActiveGridFilters } from "@lib/util/grid-filters"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const PRODUCT_LIMIT = 12

type PaginatedProductsParams = {
  limit: number
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
  fields?: string
}

// Only what ProductCard renders (plus options for the size grid filter).
// The default listProducts fields pull variant images, metadata and
// inventory for the whole catalog — a response too large for the Next
// data cache (2MB/entry), so every store/category visit paid the full
// Medusa query (~30s) again.
// Bare "categories" doesn't expand the relation in Medusa v2; ProductCard
// reads categories[0].name, so request the name explicitly.
const GRID_FIELDS =
  "id,title,handle,thumbnail,created_at,categories.name,collection,*variants.calculated_price,*options,*options.values"

export default async function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
  filters,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
  filters?: GridFilters
}) {
  const queryParams: PaginatedProductsParams = {
    limit: 12,
    fields: GRID_FIELDS,
  }

  if (collectionId) {
    queryParams["collection_id"] = [collectionId]
  }

  if (categoryId) {
    queryParams["category_id"] = [categoryId]
  }

  if (productsIds) {
    queryParams["id"] = productsIds
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const {
    response: { products, count },
  } = await listProductsWithSort({
    page,
    queryParams,
    sortBy,
    countryCode,
    filters,
  })

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  if (!products.length && hasActiveGridFilters(filters)) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg" style={{ color: "var(--text-muted)" }}>
          No products match the selected filters.
        </p>
      </div>
    )
  }

  return (
    <>
      <ul
        className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8"
        data-testid="products-list"
      >
        {products.map((p, i) => {
          // suppressHydrationWarning: ScrollReveal adds .v-in to streamed
          // HTML before this Suspense boundary hydrates
          return (
            <li key={p.id} className="v-reveal" suppressHydrationWarning>
              {/* First row is the LCP on grid pages: preload those images */}
              <ProductPreview product={p} region={region} priority={i < 4} />
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          data-testid="product-pagination"
          page={page}
          totalPages={totalPages}
        />
      )}
    </>
  )
}
