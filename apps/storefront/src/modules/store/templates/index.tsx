import { Suspense } from "react"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import SortSelect from "@modules/store/components/sort-select"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div
      className="py-6 max-w-[1680px] w-full mx-auto px-6"
      data-testid="category-container"
    >
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 data-testid="store-page-title" className="vectra-page-title">
          All products
        </h1>
        <SortSelect sortBy={sort} data-testid="sort-by-container" />
      </div>
      <Suspense fallback={<SkeletonProductGrid />}>
        <PaginatedProducts
          sortBy={sort}
          page={pageNumber}
          countryCode={countryCode}
        />
      </Suspense>
    </div>
  )
}

export default StoreTemplate
