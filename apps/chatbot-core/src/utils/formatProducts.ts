import { meetsSimilarityThreshold } from "./scoreFilter"
import type { ProductVariant, RetrievalResult } from "../types"

function formatPriceRange(min?: number, max?: number): string {
  if (min == null) return "price n/a"
  return min === max || max == null ? `$${min}` : `$${min}-$${max}`
}

// In-stock sizes/colors so the LLM never recommends unavailable variants.
function formatAvailability(variants: ProductVariant[]): string {
  const inStock = variants.filter((v) => v.inventoryQuantity > 0)
  if (variants.length > 0 && inStock.length === 0) return "Out of stock"

  const sizes = [...new Set(inStock.map((v) => v.options.size).filter(Boolean))]
  const colors = [...new Set(inStock.map((v) => v.options.color).filter(Boolean))]
  const parts: string[] = []
  if (sizes.length > 0) parts.push(`Sizes in stock: ${sizes.join(", ")}`)
  if (colors.length > 0) parts.push(`Colors: ${colors.join(", ")}`)
  return parts.join(" | ")
}

export function formatProductsForPrompt(results: RetrievalResult[]): string {
  return [...results]
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .map((r, i) => {
      const p = r.product
      const variantPrices = p.variants.map((v) => v.price)
      const priceRange = variantPrices.length > 0
        ? formatPriceRange(Math.min(...variantPrices), Math.max(...variantPrices))
        : formatPriceRange(p.priceMin, p.priceMax)
      const matchLabel = meetsSimilarityThreshold(r.similarityScore)
        ? "strong match"
        : "partial match"

      const details = [
        p.category ? `Category: ${p.category}` : "",
        p.tags.length > 0 ? `Tags: ${p.tags.join(", ")}` : "",
        `Price: ${priceRange}`,
        formatAvailability(p.variants),
      ]
        .filter(Boolean)
        .join(" | ")

      return `${i + 1}. ${p.title} (${matchLabel})\n   ${details}\n   ${p.description}`
    })
    .join("\n")
}
