import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
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
  q?: string
}

async function getSearchProducts({
  query,
  sortBy,
  page,
  countryCode,
}: {
  query: string
  sortBy: SortOptions
  page: number
  countryCode: string
}) {
  const queryParams: PaginatedProductsParams = {
    limit: 12,
    q: query,
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  const region = await getRegion(countryCode)

  if (!region) {
    return { products: [], count: 0, region: null }
  }

  const {
    response: { products, count },
  } = await listProductsWithSort({
    page,
    queryParams,
    sortBy,
    countryCode,
  })

  return { products, count, region }
}

export default async function PaginatedSearch({
  query,
  sortBy,
  page,
  countryCode,
}: {
  query: string
  sortBy: SortOptions
  page: number
  countryCode: string
}) {
  const { products, count, region } = await getSearchProducts({
    query,
    sortBy,
    page,
    countryCode,
  })

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  if (!products.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg" style={{ color: "var(--text-muted)" }}>
          No products found for &ldquo;{query}&rdquo;
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Try searching for something else or browse our catalog.
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
        {products.map((p) => {
          return (
            <li key={p.id}>
              <ProductPreview product={p} region={region ?? undefined} />
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
