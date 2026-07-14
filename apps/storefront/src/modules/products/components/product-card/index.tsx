import { getProductPrice } from "@lib/util/get-product-price"
import { matchScoreToPercent } from "@lib/util/match-score"
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

const BADGE_COLORS: Record<"new" | "sale" | "low" | "oos" | "match", string> = {
  new: "bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent-line)]",
  sale: "bg-[var(--clr-danger-bg)] text-[var(--clr-danger)] border-[var(--clr-danger-line)]",
  low: "bg-[var(--clr-warning-bg)] text-[var(--clr-warning)] border-[var(--clr-warning-line)]",
  oos: "bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--line-strong)]",
  match: "bg-[var(--clr-info-bg)] text-[var(--clr-info)] border-[var(--clr-info-line)]",
}

function Badge({
  variant,
  dot,
  children,
}: {
  variant: "new" | "sale" | "low" | "oos" | "match"
  dot?: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] h-[23px] px-[10px] rounded-full border [font-family:var(--mono)] text-[10px] font-semibold tracking-[.08em] uppercase whitespace-nowrap ${BADGE_COLORS[variant]}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="w-[5px] h-[5px] rounded-full bg-current opacity-[.85] shrink-0"
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
  priority = false,
  matchScore,
}: {
  product: HttpTypes.StoreProduct
  region?: HttpTypes.StoreRegion
  compact?: boolean
  // Preload the image (disables lazy-loading) — set on above-the-fold
  // cards, which are the LCP element on grid pages
  priority?: boolean
  // Raw cosine similarity (0–1) from the search backend. Only the chat
  // results pass it, so grids never show the match badge.
  matchScore?: number
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

  const hasBadges = isNew(product) || isSale || matchScore !== undefined

  // Shoe product photos in this catalog tend to have blank canvas baked in
  // at the bottom — crop it out with a top-anchored zoom. Other categories
  // (apparel, accessories) are already framed correctly, so leave them as-is.
  const isShoe = (product.categories ?? []).some((c) =>
    `${c.name ?? ""} ${c.handle ?? ""}`.toLowerCase().includes("shoe")
  )

  // Single variant → enable quick-add; multiple → send to PDP
  const variants = product.variants ?? []
  const firstVariantId =
    variants.length === 1 ? (variants[0].id ?? null) : null

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="vectra-card group block vectra-pc"
      data-testid="product-wrapper"
    >
      {/* Image tile */}
      <div className="relative rounded-[14px] overflow-hidden aspect-square">
        {/* When badges are present they get their own header strip above the
            photo (image inset from the top) so pills never sit on top of the
            product itself. bg-[var(--surface)] here is only a fallback behind
            transparent product photos, not a visible band in the strip. */}
        <div
          className={`absolute inset-x-0 bottom-0 bg-[var(--surface)] ${hasBadges ? "top-9" : "top-0"}`}
        >
          <Image
            src={product.thumbnail ?? placeholder}
            alt={product.title}
            fill
            // Shoe photos in this catalog often have blank canvas baked in
            // at the bottom of the frame — scale-[] zooms in to crop it,
            // origin-[] chooses where that zoom is anchored vertically
            // (more negative = crops less off the top, more off the bottom).
            // Tune both together by eye if a shoe still looks off.
            className={`object-cover pc-img ${
              isShoe ? "scale-[1] origin-[center_0%]" : "object-center"
            }`}
            sizes={
              compact
                ? "(max-width: 560px) 50vw, 33vw"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 25vw"
            }
            priority={priority}
            fetchPriority={priority ? "high" : undefined}
            draggable={false}
          />
        </div>

        {/* Badges — header strip, top left */}
        {hasBadges && (
          <div
            className="absolute top-0 left-0 right-0 h-9 px-3 flex items-center gap-2 flex-wrap pointer-events-none"
            aria-label="Product badges"
          >
            {matchScore !== undefined && (
              <span data-testid="match-score-badge" className="flex">
                <Badge variant="match" dot>
                  {matchScoreToPercent(matchScore)}% match
                </Badge>
              </span>
            )}
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

      {/* Info — font sizes for compact (chat) vs default (rail/grid) */}
      <div className={compact ? "pt-3" : "pt-[18px]"}>
        {brand && (
          <p
            className={`uppercase truncate [font-family:var(--mono)] tracking-[.09em] text-[var(--text-muted)] ${
              compact ? "text-[10px] mb-[5px]" : "text-[11px] mb-[7px]"
            }`}
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
          {/* min-h reserves two lines so prices align across the grid even
              for short names (2 × font-size × 1.35 line-height) */}
          <p
            className={`font-normal leading-[1.35] text-[var(--text)] line-clamp-2 ${
              compact ? "text-[13px] min-h-[35px]" : "text-[14.5px] min-h-[39px]"
            }`}
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
                    className={`line-through text-[var(--text-muted)] mb-[2px] ${
                      compact ? "text-[12px]" : "text-[13px]"
                    }`}
                    data-testid="original-price"
                  >
                    {cheapestPrice.original_price}
                  </p>
                  <p
                    className={`font-semibold whitespace-nowrap text-[var(--clr-danger)] ${
                      compact ? "text-[14px]" : "text-[16px]"
                    }`}
                    data-testid="price"
                  >
                    {cheapestPrice.calculated_price}
                  </p>
                </>
              ) : (
                <p
                  className={`font-semibold whitespace-nowrap text-[var(--text)] ${
                    compact ? "text-[14px]" : "text-[16px]"
                  }`}
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
