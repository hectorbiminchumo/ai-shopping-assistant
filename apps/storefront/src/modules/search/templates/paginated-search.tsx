import { search } from "@lib/api"
import { listProducts, listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { sortProducts } from "@lib/util/sort-products"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const PRODUCT_LIMIT = 12

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
  const region = await getRegion(countryCode)

  if (!region) {
    return { products: [], count: 0, region: null }
  }

  // Semantic search (same backend the chat uses), so natural-language
  // queries work here too. Results come back ranked by similarity.
  try {
    const { products: matches } = await search(query, PRODUCT_LIMIT)

    if (!matches.length) {
      return { products: [], count: 0, region }
    }

    const {
      response: { products },
    } = await listProducts({
      countryCode,
      queryParams: {
        id: matches.map((m) => m.medusaProductId),
        limit: PRODUCT_LIMIT,
      },
    })

    // Medusa returns them in arbitrary order — restore relevance order,
    // unless the user explicitly sorted by price.
    const byId = new Map(products.map((p) => [p.id, p]))
    let ordered = matches.flatMap((m) => byId.get(m.medusaProductId) ?? [])
    if (sortBy === "price_asc" || sortBy === "price_desc") {
      ordered = sortProducts(ordered, sortBy)
    }

    return { products: ordered, count: ordered.length, region }
  } catch {
    // AI backend unavailable → fall back to Medusa keyword search so the
    // page keeps working.
    const queryParams: { limit: number; q?: string } = {
      limit: PRODUCT_LIMIT,
      q: query,
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
            <li key={p.id} className="v-reveal">
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
