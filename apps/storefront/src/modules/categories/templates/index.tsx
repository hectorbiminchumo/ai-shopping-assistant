import { notFound } from "next/navigation"
import { Suspense } from "react"

import { listProducts } from "@lib/data/products"
import { GridFilters as GridFilterValues } from "@lib/util/grid-filters"
import { collectSizeOptions } from "@lib/util/size-options"
import InteractiveLink from "@modules/common/components/interactive-link"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import GridFilters from "@modules/store/components/grid-filters"
import SortSelect from "@modules/store/components/sort-select"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

// Size options for the filter dropdown: distinct "Size" values across the
// category. Light fields + the 5-min product cache keep this cheap.
async function listCategorySizes(
  categoryId: string,
  countryCode: string
): Promise<string[]> {
  try {
    const {
      response: { products },
    } = await listProducts({
      countryCode,
      queryParams: {
        category_id: [categoryId],
        limit: 100,
        fields: "id,*options,*options.values",
      } as HttpTypes.StoreProductListParams,
    })
    return collectSizeOptions(products)
  } catch {
    // Without sizes the dropdown is simply hidden — filters still work
    return []
  }
}

export default async function CategoryTemplate({
  category,
  sortBy,
  page,
  countryCode,
  filters,
}: {
  category: HttpTypes.StoreProductCategory
  sortBy?: SortOptions
  page?: string
  countryCode: string
  filters?: GridFilterValues
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  if (!category || !countryCode) notFound()

  const sizes = await listCategorySizes(category.id, countryCode)

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
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <GridFilters sizes={sizes} />
          <SortSelect sortBy={sort} data-testid="sort-by-container" />
        </div>
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
          filters={filters}
        />
      </Suspense>
    </div>
  )
}
