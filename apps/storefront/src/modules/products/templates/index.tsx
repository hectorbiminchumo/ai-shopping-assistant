import React, { Suspense } from "react"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import PDPGallery from "@modules/products/components/pdp-gallery"
import ProductActions from "@modules/products/components/product-actions"
import RelatedProducts from "@modules/products/components/related-products"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

export default function ProductTemplate({
  product,
  region,
  countryCode,
  images,
}: ProductTemplateProps) {
  if (!product?.id) return notFound()

  const category =
    product.collection?.title ?? product.categories?.[0]?.name ?? null

  return (
    <>
      <main
        className="pdp"
        style={{ maxWidth: "var(--maxw)", margin: "0 auto", padding: "40px var(--pad) 100px" }}
        data-testid="product-container"
      >
        {/* Breadcrumbs */}
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <LocalizedClientLink href="/">Home</LocalizedClientLink>
          <span style={{ color: "var(--line-strong)" }}>/</span>
          {category ? (
            <>
              <LocalizedClientLink href="/store">{category}</LocalizedClientLink>
              <span style={{ color: "var(--line-strong)" }}>/</span>
            </>
          ) : (
            <>
              <LocalizedClientLink href="/store">Store</LocalizedClientLink>
              <span style={{ color: "var(--line-strong)" }}>/</span>
            </>
          )}
          <span>{product.title}</span>
        </nav>

        {/* 2-column grid */}
        <div className="pdp__grid">
          {/* Gallery — sticky left */}
          <PDPGallery images={images} title={product.title} />

          {/* Side panel — right */}
          <Suspense
            fallback={
              <ProductActions disabled product={product} region={region} />
            }
          >
            <ProductActionsWrapper id={product.id} region={region} />
          </Suspense>
        </div>
      </main>

      {/* Related products */}
      <div
        style={{ maxWidth: "var(--maxw)", margin: "0 auto", padding: "0 var(--pad) 80px" }}
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}
