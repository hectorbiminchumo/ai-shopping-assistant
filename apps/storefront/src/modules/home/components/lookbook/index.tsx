import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RailSection from "@modules/common/components/rail-section"
import Image from "next/image"

const TARGET = 10

// Default Medusa starter products — hidden from the storefront.
const JUNK_HANDLES = new Set(["t-shirt", "sweatshirt", "sweatpants", "shorts"])

const STATIC_ITEMS = [
  { label: "Trail Lightrange™", sub: "short-sleeve tee",  handle: "meridian-tee",  color: "1a1a17" },
  { label: "Packable polo",      sub: "short-sleeve",      handle: "meridian-tee",  color: "0f1a0f" },
  { label: "Lightrange™ jacket", sub: "shell layer",       handle: "shell-jacket",  color: "0a0f1a" },
  { label: "Sunriser hoodie",    sub: "midlayer",          handle: "drift-hoodie",  color: "1a0f0a" },
  { label: "Trail long-sleeve",  sub: "tee",               handle: "meridian-tee",  color: "1a1a0a" },
  { label: "Technical short",    sub: "5\" inseam",        handle: "pace-short",    color: "0d1a1a" },
  { label: "Flux tight",         sub: "compression",       handle: "flux-tight",    color: "1a0a1a" },
  { label: "Cloud Step",         sub: "training shoe",     handle: "cloud-step",    color: "0a1a0a" },
  { label: "Vapor Run cap",      sub: "lightweight",       handle: "vapor-cap",     color: "1a1510" },
  { label: "Core 12L vest",      sub: "trail pack",        handle: "core-pack",     color: "101520" },
]

type LookItem = { handle: string; label: string; sub: string; src: string }

function fill(source: LookItem[], target: number): LookItem[] {
  if (!source.length) return []
  const result: LookItem[] = []
  while (result.length < target) {
    result.push(...source.slice(0, target - result.length))
  }
  return result
}

function fromProducts(products: HttpTypes.StoreProduct[]): LookItem[] {
  return products.map((p, i) => ({
    handle: p.handle ?? "",
    label: p.title,
    sub: p.collection?.title ?? p.categories?.[0]?.name ?? "",
    src: p.thumbnail ?? `https://placehold.co/360x480/${STATIC_ITEMS[i % STATIC_ITEMS.length].color}/f4f3f0?text=${encodeURIComponent(p.title)}`,
  }))
}

function fromStatic(): LookItem[] {
  return STATIC_ITEMS.map((s) => ({
    handle: s.handle,
    label: s.label,
    sub: s.sub,
    src: `https://placehold.co/360x480/${s.color}/f4f3f0?text=${encodeURIComponent(s.label)}`,
  }))
}

export default async function Lookbook({ regionId }: { regionId: string }) {
  let base: LookItem[] = []

  try {
    const { response } = await listProducts({
      regionId,
      queryParams: { limit: 20, fields: "id,title,handle,thumbnail,collection,categories" },
    })
    const products = (response.products ?? []).filter(
      (p) => !JUNK_HANDLES.has(p.handle ?? "")
    )
    if (products.length) base = fromProducts(products)
  } catch { /* fallback */ }

  if (!base.length) base = fromStatic()

  const items = fill(base, TARGET)

  return (
    <RailSection eyebrow="Lookbook" title="Shop your style" background="var(--surface)">
      {items.map((item, i) => (
        <li
          key={`${item.handle}-${i}`}
          className="shrink-0"
          style={{ flex: "0 0 calc((100% - 72px) / 5)", scrollSnapAlign: "start", minWidth: 140 }}
        >
          <LocalizedClientLink
            href={`/products/${item.handle}`}
            className="block group"
            aria-label={`${item.label}, ${item.sub}`}
          >
            <div className="relative rounded-[14px] overflow-hidden" style={{ aspectRatio: "3/4" }}>
              <Image
                src={item.src}
                alt={item.label}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              />
            </div>
            <div
              className="font-mono text-[10.5px] tracking-[.1em] uppercase leading-relaxed mt-3"
              style={{ color: "var(--text-muted)" }}
            >
              {item.label}
              <br />
              {item.sub}
            </div>
          </LocalizedClientLink>
        </li>
      ))}
    </RailSection>
  )
}
