import { listCategories } from "@lib/data/categories"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RailSection from "@modules/common/components/rail-section"
import Image from "next/image"

// Default Medusa starter categories — hidden from the storefront.
const JUNK_HANDLES = new Set(["shirts", "sweatshirts", "pants", "merch"])

const TILE_COLORS = [
  { bg: "1a1a17", fg: "f4f3f0" },
  { bg: "0f1a0f", fg: "f4f3f0" },
  { bg: "0a0f1a", fg: "f4f3f0" },
  { bg: "1a0f0a", fg: "f4f3f0" },
  { bg: "1a1a0a", fg: "f4f3f0" },
]

const CATEGORY_IMAGES: Record<string, string> = {
  "running-shoes": "/categories/running-shoes.jpg",
  "training-apparel": "/categories/training-apparel.jpg",
  "jackets": "/categories/jackets.jpg",
}

const STATIC_FALLBACK = [
  { name: "Running",   handle: "running"   },
  { name: "Training",  handle: "training"  },
  { name: "Outdoor",   handle: "outdoor"   },
  { name: "Lifestyle", handle: "lifestyle" },
  { name: "Equipment", handle: "equipment" },
]

type Item = { name: string; handle: string; count: number; src: string }

// "running-shoes" → "Running Shoes"
function prettyName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function CategoryCard({ name, handle, count, src }: Item) {
  return (
    <LocalizedClientLink
      href={`/categories/${handle}`}
      className="flex flex-col items-center gap-4 text-center group"
    >
      <div
        className="w-full aspect-square rounded-[18px] overflow-hidden relative transition-transform duration-300 group-hover:-translate-y-1"
        style={{ boxShadow: "0 1px 2px rgba(16,16,16,.04), 0 8px 30px rgba(16,16,16,.06)" }}
      >
        <Image
          src={src}
          alt={name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
        />
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,.25) 100%)" }}
          aria-hidden="true"
        />
      </div>
      <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{name}</span>
      {count > 0 && (
        <span className="font-mono text-[11px] tracking-[.04em] -mt-2.5" style={{ color: "var(--text-muted)" }}>
          {count} products
        </span>
      )}
    </LocalizedClientLink>
  )
}

export default async function CategoryGrid() {
  let fetched: HttpTypes.StoreProductCategory[] = []

  try {
    const result = await listCategories({ limit: 20 })
    fetched = (result ?? []).filter(
      (c) => !c.parent_category && !JUNK_HANDLES.has(c.handle)
    )
  } catch { /* fallback */ }

  const items: Item[] = fetched.length
    ? fetched.map((c, i) => {
        const { bg, fg } = TILE_COLORS[i % TILE_COLORS.length]
        return {
          name: prettyName(c.name),
          handle: c.handle,
          count: c.products?.length ?? 0,
          src:
            CATEGORY_IMAGES[c.handle] ??
            c.products?.[0]?.thumbnail ??
            `https://placehold.co/400x400/${bg}/${fg}?text=${encodeURIComponent(prettyName(c.name))}`,
        }
      })
    : STATIC_FALLBACK.map((c, i) => {
        const { bg, fg } = TILE_COLORS[i % TILE_COLORS.length]
        return {
          name: c.name,
          handle: c.handle,
          count: 0,
          src: `https://placehold.co/400x400/${bg}/${fg}?text=${encodeURIComponent(c.name)}`,
        }
      })

  // Divide by however many categories actually render (capped at 5) so a
  // short list still fills the row instead of leaving it half-empty.
  const perRow = Math.min(items.length, 5) || 1
  const basis = `calc((100% - ${22 * (perRow - 1)}px) / ${perRow})`

  return (
    <RailSection title="Categories" background="var(--surface)">
      {items.map((item, i) => (
        <li
          key={`${item.handle}-${i}`}
          className="shrink-0"
          style={{ flex: `0 0 ${basis}`, scrollSnapAlign: "start", minWidth: 140 }}
        >
          <CategoryCard {...item} />
        </li>
      ))}
    </RailSection>
  )
}
