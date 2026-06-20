"use client"

import { addToCart } from "@lib/data/cart"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import { isEqual } from "lodash"
import { useParams, usePathname, useSearchParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

/* ─── helpers ─────────────────────────────────────────────── */
const optionsAsKeymap = (opts: HttpTypes.StoreProductVariant["options"]) =>
  opts?.reduce((acc: Record<string, string>, o) => {
    if (o.option_id) acc[o.option_id] = o.value
    return acc
  }, {}) ?? {}

function isNew(createdAt?: string | null) {
  if (!createdAt) return false
  return (Date.now() - new Date(createdAt).getTime()) / 86_400_000 <= 30
}

/* ─── Accordion (self-contained) ──────────────────────────── */
function AccItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`acc__item${open ? " open" : ""}`}>
      <button className="acc__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {title}
        <span className="acc__icon" aria-hidden="true" />
      </button>
      <div className="acc__body">
        <div className="acc__body-in">{children}</div>
      </div>
    </div>
  )
}

/* ─── Component ────────────────────────────────────────────── */
export default function ProductActions({
  product,
  disabled,
}: {
  product: HttpTypes.StoreProduct
  region?: HttpTypes.StoreRegion
  disabled?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const countryCode = useParams().countryCode as string
  const actionsRef = useRef<HTMLDivElement>(null)

  const [options, setOptions] = useState<Record<string, string | undefined>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [addedOk, setAddedOk] = useState(false)

  // Pre-select if single variant
  useEffect(() => {
    if (product.variants?.length === 1) {
      setOptions(optionsAsKeymap(product.variants[0].options))
    }
  }, [product.variants])

  const selectedVariant = useMemo(
    () =>
      product.variants?.find((v) =>
        isEqual(optionsAsKeymap(v.options), options)
      ),
    [product.variants, options]
  )

  const isValidVariant = useMemo(
    () =>
      product.variants?.some((v) =>
        isEqual(optionsAsKeymap(v.options), options)
      ) ?? false,
    [product.variants, options]
  )

  // Sync variant id to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const value = isValidVariant ? (selectedVariant?.id ?? null) : null
    if (params.get("v_id") === value) return
    if (value) params.set("v_id", value)
    else params.delete("v_id")
    router.replace(pathname + "?" + params.toString())
  }, [selectedVariant, isValidVariant])

  const inStock = useMemo(() => {
    if (!selectedVariant) return false
    if (!selectedVariant.manage_inventory) return true
    if (selectedVariant.allow_backorder) return true
    return (selectedVariant.inventory_quantity ?? 0) > 0
  }, [selectedVariant])

  const lowStock = useMemo(() => {
    if (!selectedVariant?.manage_inventory) return false
    const q = selectedVariant.inventory_quantity ?? 0
    return q > 0 && q <= 5
  }, [selectedVariant])

  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return
    setIsAdding(true)
    await addToCart({ variantId: selectedVariant.id, quantity: 1, countryCode })
    setIsAdding(false)
    setAddedOk(true)
    setTimeout(() => setAddedOk(false), 1600)
  }

  // Price
  const { cheapestPrice, variantPrice } = getProductPrice({ product, variantId: selectedVariant?.id })
  const price = selectedVariant ? variantPrice : cheapestPrice
  const isSale = price?.price_type === "sale"
  const discountPct = price?.percentage_diff ? Math.round(parseFloat(price.percentage_diff)) : null

  // Badge
  const badge = isSale ? "sale" : isNew(product.created_at) ? "new" : null

  // Category / brand
  const brand = product.collection?.title ?? product.categories?.[0]?.name ?? null

  // ATC button label
  const ctaLabel = addedOk
    ? "Added ✓"
    : isAdding
    ? "Adding…"
    : !selectedVariant && (product.variants?.length ?? 0) > 1
    ? "Select size"
    : !inStock
    ? "Out of stock"
    : "Add to cart"

  const ctaDisabled = disabled || isAdding || !inStock || (!selectedVariant && (product.variants?.length ?? 0) > 1)

  return (
    <div className="pdp__side" ref={actionsRef}>
      {/* Brand + badge */}
      <div className="pdp__brand-row">
        {brand && <span>{brand}</span>}
        {badge === "new" && (
          <span className="badge badge--new"><span className="badge__dot" />New</span>
        )}
        {badge === "sale" && (
          <span className="badge badge--sale">Sale</span>
        )}
      </div>

      {/* Title */}
      <h1 className="pdp__title">{product.title}</h1>

      {/* Description */}
      {product.description && (
        <p className="pdp__desc">{product.description}</p>
      )}

      {/* Options (size selector) */}
      {(product.options ?? []).map((option) => {
        const values = option.values ?? []
        if (!values.length) return null
        return (
          <div key={option.id}>
            <div className="pdp__label">
              <span>Select {option.title?.toLowerCase() ?? "option"}</span>
              <a href="#">Size guide</a>
            </div>
            <div className="sizes">
              {values.map((v) => {
                const variant = product.variants?.find((variant) =>
                  variant.options?.some(
                    (o) => o.option_id === option.id && o.value === v.value
                  )
                )
                const isOos =
                  variant?.manage_inventory &&
                  !variant?.allow_backorder &&
                  (variant?.inventory_quantity ?? 0) === 0
                const isSel = options[option.id ?? ""] === v.value
                return (
                  <button
                    key={v.id}
                    className={`size${isSel ? " sel" : ""}${isOos ? " oos" : ""}`}
                    disabled={!!isOos || !!disabled}
                    onClick={() => option.id && setOptions((prev) => ({ ...prev, [option.id!]: v.value }))}
                    aria-pressed={isSel}
                  >
                    {v.value}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Low stock alert */}
      {lowStock && selectedVariant && (
        <div className="alert alert--warning">
          <svg className="alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4M12 17h.01M10.3 3.7a2 2 0 013.4 0l7.7 13.3A2 2 0 0119.7 20H4.3a2 2 0 01-1.7-3z"/>
          </svg>
          <div>
            <div className="alert__title">Only {selectedVariant.inventory_quantity} left</div>
            <div className="alert__body">This item is selling fast — secure yours now.</div>
          </div>
        </div>
      )}

      {/* Out of stock alert */}
      {selectedVariant && !inStock && (
        <div className="alert alert--danger">
          <svg className="alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>
          </svg>
          <div>
            <div className="alert__title">Out of stock</div>
            <div className="alert__body">This size is currently unavailable.</div>
          </div>
        </div>
      )}

      {/* Price */}
      {price && (
        <div className="pdp__price">
          {isSale ? (
            <div className="pdp__price-sale">
              <span className="pdp__price-value" style={{ color: "var(--clr-danger)" }}>
                {price.calculated_price}
              </span>
              <span className="pdp__price-original">{price.original_price}</span>
              {discountPct && (
                <span className="badge badge--sale">−{discountPct}%</span>
              )}
              <small className="pdp__price-meta">· incl. VAT</small>
            </div>
          ) : (
            <span className="pdp__price-value">
              {!selectedVariant && (product.variants?.length ?? 0) > 1 ? "From " : ""}
              {price.calculated_price}
              <small className="pdp__price-meta">· incl. VAT</small>
            </span>
          )}
        </div>
      )}

      {/* ATC */}
      <button
        className="pdp__cta"
        onClick={handleAddToCart}
        disabled={!!ctaDisabled}
        data-testid="add-product-button"
        style={addedOk ? { background: "var(--clr-success)", color: "#fff" } : undefined}
      >
        {ctaLabel}
      </button>

      {/* Meta */}
      <div className="pdp__meta">
        <span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M3 7h13l5 5v5h-3M3 7v10h2M16 17H9"/>
            <circle cx="6.5" cy="17.5" r="1.5"/>
            <circle cx="17.5" cy="17.5" r="1.5"/>
          </svg>
          Free shipping over €50
        </span>
        <span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          30-day returns
        </span>
      </div>

      {/* Accordion */}
      <div className="acc">
        <AccItem title="Product information">
          {product.material && <p><strong>Material:</strong> {product.material}</p>}
          {product.origin_country && <p><strong>Country of origin:</strong> {product.origin_country}</p>}
          {product.weight && <p><strong>Weight:</strong> {product.weight} g</p>}
          {product.description && !product.material && <p>{product.description}</p>}
          {!product.material && !product.description && (
            <p>Premium sportswear crafted for performance and style.</p>
          )}
        </AccItem>
        <AccItem title="Shipping & returns">
          Standard shipping in 2–4 business days. Free over €50. Free returns within 30 days of delivery. No questions asked.
        </AccItem>
        <AccItem title="Materials & care">
          {product.material
            ? `${product.material}. Machine wash at 30°C with similar colors. Do not bleach. Line dry.`
            : "Follow care instructions on the label. Machine wash at 30°C. Do not bleach. Line dry."}
        </AccItem>
      </div>
    </div>
  )
}
