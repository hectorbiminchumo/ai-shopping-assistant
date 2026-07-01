import { notFound } from "next/navigation"
import { Suspense } from "react"

import InteractiveLink from "@modules/common/components/interactive-link"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import SortSelect from "@modules/store/components/sort-select"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

export default function CategoryTemplate({
  category,
  sortBy,
  page,
  countryCode,
}: {
  category: HttpTypes.StoreProductCategory
  sortBy?: SortOptions
  page?: string
  countryCode: string
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  if (!category || !countryCode) notFound()

  const parents = [] as HttpTypes.StoreProductCategory[]

  const getParents = (category: HttpTypes.StoreProductCategory) => {
    if (category.parent_category) {
      parents.push(category.parent_category)
      getParents(category.parent_category)
    }
  }

  getParents(category)

  return (
    <div
      className="py-6 max-w-[1680px] w-full mx-auto px-6"
      data-testid="category-container"
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <nav
          className="flex items-center gap-1.5 flex-wrap"
          aria-label="Breadcrumb"
        >
          <LocalizedClientLink
            href="/"
            style={{ fontSize: 12.5, color: "var(--text-muted)" }}
          >
            Home
          </LocalizedClientLink>
          <span style={{ color: "var(--line-strong)", fontSize: 12.5 }}>/</span>
          {parents
            .slice()
            .reverse()
            .map((parent) => (
              <span key={parent.id} className="flex items-center gap-1.5">
                <LocalizedClientLink
                  href={`/categories/${parent.handle}`}
                  data-testid="sort-by-link"
                  style={{ fontSize: 12.5, color: "var(--text-muted)" }}
                >
                  {parent.name}
                </LocalizedClientLink>
                <span style={{ color: "var(--line-strong)", fontSize: 12.5 }}>/</span>
              </span>
            ))}
          <span style={{ fontSize: 12.5, color: "var(--text)" }}>
            {category.name}
          </span>
        </nav>
        <SortSelect sortBy={sort} data-testid="sort-by-container" />
      </div>
      <h1 data-testid="category-page-title" className="vectra-page-title mb-4">
        {category.name}
      </h1>
      {category.description && (
        <div className="mb-8 text-base-regular">
          <p>{category.description}</p>
        </div>
      )}
      {category.category_children && (
        <div className="mb-8 text-base-large">
          <ul className="grid grid-cols-1 gap-2">
            {category.category_children?.map((c) => (
              <li key={c.id}>
                <InteractiveLink href={`/categories/${c.handle}`}>
                  {c.name}
                </InteractiveLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Suspense
        fallback={
          <SkeletonProductGrid
            numberOfProducts={category.products?.length ?? 8}
          />
        }
      >
        <PaginatedProducts
          sortBy={sort}
          page={pageNumber}
          categoryId={category.id}
          countryCode={countryCode}
        />
      </Suspense>
    </div>
  )
}
