import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Image from "next/image"

export default async function ProductPreview({
  product,
  isFeatured: _isFeatured,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({ product })
  const brand =
    product.collection?.title ??
    product.categories?.[0]?.name ??
    ""

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="group block"
      data-testid="product-wrapper"
    >
      {/* Image tile */}
      <div
        className="relative aspect-square rounded-[14px] overflow-hidden"
        style={{ background: "var(--surface)" }}
      >
        <Image
          src={
            product.thumbnail ??
            `https://placehold.co/600x600/f6f6f4/6a6a67?text=${encodeURIComponent(product.title)}`
          }
          alt={product.title}
          fill
          className="object-cover object-center"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 25vw"
          quality={60}
          draggable={false}
        />

        {/* Hover indicator */}
        <div
          className="absolute right-3 bottom-3 w-[42px] h-[42px] rounded-[16px] grid place-items-center
                     opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0
                     transition-all duration-200 pointer-events-none"
          style={{
            background: "var(--text)",
            color: "var(--bg)",
            boxShadow: "0 4px 16px rgba(0,0,0,.16)",
          }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="w-[21px] h-[21px]"
          >
            <path d="M5 12h13M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Info row */}
      <div className="pt-4 flex justify-between items-baseline gap-3">
        <div>
          <p
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text)" }}
            data-testid="product-title"
          >
            {product.title}
          </p>
          {brand && (
            <p
              className="text-[13px] mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {brand}
            </p>
          )}
        </div>
        {cheapestPrice && (
          <div className="shrink-0 text-right">
            {cheapestPrice.price_type === "sale" && (
              <p
                className="text-[12px] line-through"
                style={{ color: "var(--text-muted)" }}
                data-testid="original-price"
              >
                {cheapestPrice.original_price}
              </p>
            )}
            <p
              className="text-[15px] font-semibold whitespace-nowrap"
              style={{
                color:
                  cheapestPrice.price_type === "sale"
                    ? "var(--clr-danger)"
                    : "var(--text)",
              }}
              data-testid="price"
            >
              {cheapestPrice.calculated_price}
            </p>
          </div>
        )}
      </div>
    </LocalizedClientLink>
  )
}
