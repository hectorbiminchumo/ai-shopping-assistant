import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import RailSection from "@modules/common/components/rail-section"
import ProductCard from "@modules/products/components/product-card"

const TARGET = 8

// Default Medusa starter products — hidden from the storefront.
const JUNK_HANDLES = new Set(["t-shirt", "sweatshirt", "sweatpants", "shorts"])

// Fallback placeholders when no real products exist
const FALLBACK_PRODUCTS = [
  { title: "Aero Glide",           handle: "aero-glide",    category: "Running",   color: "1a1a17" },
  { title: "Cloud Step",           handle: "cloud-step",    category: "Training",  color: "0f1a0f" },
  { title: "Trail Vector GTX",     handle: "trail-vector",  category: "Outdoor",   color: "0a0f1a" },
  { title: "Meridian Merino Tee",  handle: "meridian-tee",  category: "Lifestyle", color: "1a0f0a" },
  { title: "Stormshell Jacket",    handle: "shell-jacket",  category: "Outdoor",   color: "1a1a0a" },
  { title: "Drift Cotton Hoodie",  handle: "drift-hoodie",  category: "Lifestyle", color: "0d1a1a" },
  { title: "Vapor Run Cap",        handle: "vapor-cap",     category: "Equipment", color: "1a0a1a" },
  { title: "Core 12L Vest Pack",   handle: "core-pack",     category: "Equipment", color: "0a1a0a" },
]

function fill<T>(source: T[], target: number): T[] {
  if (!source.length) return []
  const result: T[] = []
  while (result.length < target) {
    result.push(...source.slice(0, target - result.length))
  }
  return result
}

function FallbackCard({ title, handle, category, color }: (typeof FALLBACK_PRODUCTS)[0]) {
  const src = `https://placehold.co/600x600/${color}/f4f3f0?text=${encodeURIComponent(title)}`
  return (
    <a
      href={`/products/${handle}`}
      className="vectra-card block"
      style={{ textDecoration: "none" }}
    >
      <div className="relative rounded-[14px] overflow-hidden" style={{ aspectRatio: "1/1", background: "var(--surface)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div className="flex justify-between items-baseline gap-3 pt-4">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{title}</p>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>{category}</p>
        </div>
      </div>
    </a>
  )
}

export default async function ProductRail({
  collection,
  region,
}: {
  collection?: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  let products: HttpTypes.StoreProduct[] = []

  try {
    const res = await listProducts({
      regionId: region.id,
      queryParams: {
        ...(collection ? { collection_id: collection.id } : {}),
        fields: "*variants.calculated_price",
        limit: 20,
      },
    })
    products = (res.response.products ?? []).filter(
      (p) => !JUNK_HANDLES.has(p.handle ?? "")
    )
  } catch { /* fallback */ }

  // Pad real products to TARGET (cycles through them if fewer than 8)
  const filledProducts = fill(products, TARGET)

  const title = collection?.title ?? "Featured"
  const viewAll = collection ? `/collections/${collection.handle}` : "/store"

  if (!filledProducts.length) {
    // No real products at all — use static placeholders
    const fallbacks = fill(FALLBACK_PRODUCTS, TARGET)
    return (
      <RailSection title={title} viewAllHref={viewAll}>
        {fallbacks.map((p, i) => (
          <li
            key={`${p.handle}-${i}`}
            className="shrink-0"
            style={{ flex: "0 0 calc((100% - 66px) / 4)", scrollSnapAlign: "start", minWidth: 200 }}
          >
            <FallbackCard {...p} />
          </li>
        ))}
      </RailSection>
    )
  }

  return (
    <RailSection eyebrow="Selection" title={title} viewAllHref={viewAll}>
      {filledProducts.map((product, i) => (
        <li
          key={`${product.id}-${i}`}
          className="shrink-0"
          style={{ flex: "0 0 calc((100% - 66px) / 4)", scrollSnapAlign: "start", minWidth: 200 }}
        >
          <ProductCard product={product} region={region} />
        </li>
      ))}
    </RailSection>
  )
}
