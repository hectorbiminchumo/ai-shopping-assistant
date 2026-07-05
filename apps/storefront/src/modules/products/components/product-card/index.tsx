import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Image from "next/image"
import QuickAdd from "./quick-add"

/* -------- badge helpers -------- */
function isNew(product: HttpTypes.StoreProduct) {
  if (!product.created_at) return false
  const days = (Date.now() - new Date(product.created_at).getTime()) / 86_400_000
  return days <= 30
}

function Badge({
  variant,
  dot,
  children,
}: {
  variant: "new" | "sale" | "low" | "oos"
  dot?: boolean
  children: React.ReactNode
}) {
  const colorMap: Record<string, { bg: string; color: string; border: string }> = {
    new:  { bg: "var(--accent-bg)",       color: "var(--accent)",       border: "var(--accent-line)"       },
    sale: { bg: "var(--clr-danger-bg)",   color: "var(--clr-danger)",   border: "var(--clr-danger-line)"   },
    low:  { bg: "var(--clr-warning-bg)",  color: "var(--clr-warning)",  border: "var(--clr-warning-line)"  },
    oos:  { bg: "var(--surface-2)",       color: "var(--text-muted)",   border: "var(--line-strong)"       },
  }
  const c = colorMap[variant]
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 22,
        padding: "0 8px",
        borderRadius: 999,
        fontFamily: "var(--mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.color,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}

/* -------- main component -------- */
export default function ProductCard({
  product,
  compact = false,
}: {
  product: HttpTypes.StoreProduct
  region?: HttpTypes.StoreRegion
  compact?: boolean
}) {
  const { cheapestPrice } = getProductPrice({ product })
  const isSale = cheapestPrice?.price_type === "sale"
  const discountPct = cheapestPrice?.percentage_diff
    ? Math.round(parseFloat(cheapestPrice.percentage_diff))
    : null

  const brand =
    product.collection?.title ??
    product.categories?.[0]?.name ??
    ""

  const placeholder = `https://placehold.co/600x600/f6f6f4/6a6a67?text=${encodeURIComponent(product.title)}`

  // Single variant → enable quick-add; multiple → send to PDP
  const variants = product.variants ?? []
  const firstVariantId =
    variants.length === 1 ? (variants[0].id ?? null) : null

  // Font sizes for compact (chat) vs default (rail/grid)
  const nameSize = compact ? 13 : 14.5
  const eyebrowSize = compact ? 10 : 11
  const priceSize = compact ? 14 : 16
  const nameLineHeight = 1.35
  // Reserve two lines so prices align across the grid even for short names.
  const nameMinHeight = Math.round(nameSize * nameLineHeight * 2)

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="vectra-card group block vectra-pc"
      data-testid="product-wrapper"
    >
      {/* Image tile */}
      <div
        className="relative rounded-[14px] overflow-hidden"
        style={{ aspectRatio: "1 / 1", background: "var(--surface)" }}
      >
        <Image
          src={product.thumbnail ?? placeholder}
          alt={product.title}
          fill
          className="object-cover object-center pc-img"
          sizes={
            compact
              ? "(max-width: 560px) 50vw, 33vw"
              : "(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 25vw"
          }
          draggable={false}
        />

        {/* Badges — top left */}
        {(isNew(product) || isSale) && (
          <div
            className="absolute top-3 left-3 flex gap-[5px] flex-wrap pointer-events-none"
            aria-label="Product badges"
          >
            {isNew(product) && !isSale && (
              <Badge variant="new" dot>New</Badge>
            )}
            {isSale && discountPct && (
              <Badge variant="sale">−{discountPct}%</Badge>
            )}
          </div>
        )}

        {/* Quick Add — bottom right, hidden until card hover */}
        <QuickAdd
          variantId={firstVariantId}
          productHandle={product.handle ?? ""}
          productTitle={product.title}
          compact={compact}
        />
      </div>

      {/* Info */}
      <div style={{ paddingTop: compact ? 12 : 18 }}>
        {brand && (
          <p
            className="uppercase truncate"
            style={{
              fontFamily: "var(--mono)",
              fontSize: eyebrowSize,
              letterSpacing: ".09em",
              color: "var(--text-muted)",
              marginBottom: compact ? 5 : 7,
            }}
          >
            {brand}
          </p>
        )}

        <div
          className={
            compact
              ? "flex items-center justify-between gap-3"
              : "flex flex-col gap-1.5 small:flex-row small:items-start small:justify-between small:gap-4"
          }
        >
          <p
            className="font-normal"
            style={{
              fontSize: nameSize,
              lineHeight: nameLineHeight,
              color: "var(--text)",
              minHeight: nameMinHeight,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            data-testid="product-title"
          >
            {product.title}
          </p>

          {cheapestPrice && (
            <div
              className={`shrink-0 leading-tight ${compact ? "text-right" : "small:text-right"}`}
            >
              {isSale ? (
                <>
                  <p
                    className="line-through"
                    style={{
                      fontSize: eyebrowSize + 2,
                      color: "var(--text-muted)",
                      marginBottom: 2,
                    }}
                    data-testid="original-price"
                  >
                    {cheapestPrice.original_price}
                  </p>
                  <p
                    className="font-semibold whitespace-nowrap"
                    style={{ fontSize: priceSize, color: "var(--clr-danger)" }}
                    data-testid="price"
                  >
                    {cheapestPrice.calculated_price}
                  </p>
                </>
              ) : (
                <p
                  className="font-semibold whitespace-nowrap"
                  style={{ fontSize: priceSize, color: "var(--text)" }}
                  data-testid="price"
                >
                  {cheapestPrice.calculated_price}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </LocalizedClientLink>
  )
}
