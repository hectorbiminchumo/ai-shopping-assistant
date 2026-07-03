import { Suspense } from "react"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import SortSelect from "@modules/store/components/sort-select"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedSearch from "./paginated-search"

const PRODUCT_LIMIT = 12

const SearchTemplate = ({
  query,
  sortBy,
  page,
  countryCode,
}: {
  query?: string
  sortBy?: SortOptions
  page?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  if (!query) {
    return (
      <div
        className="py-6 max-w-[1680px] w-full mx-auto px-6"
        data-testid="search-container"
      >
        <h1 className="vectra-page-title">Search</h1>
        <p className="mt-4" style={{ color: "var(--text-muted)" }}>
          Enter a search term to find products.
        </p>
      </div>
    )
  }

  return (
    <div
      className="py-6 max-w-[1680px] w-full mx-auto px-6"
      data-testid="search-container"
    >
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="vectra-page-title">Search results</h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Results for &ldquo;{query}&rdquo;
          </p>
        </div>
        <SortSelect sortBy={sort} data-testid="sort-by-container" />
      </div>
      <Suspense fallback={<SkeletonProductGrid />}>
        <PaginatedSearch
          query={query}
          sortBy={sort}
          page={pageNumber}
          countryCode={countryCode}
        />
      </Suspense>
    </div>
  )
}

export default SearchTemplate
