import type { Product } from "../types"

export function formatProductsForPrompt(products: Product[]): string {
  return products
    .map((p) => {
      const prices = p.variants.map((v) => v.price)
      const priceRange =
        prices.length > 0 ? `$${Math.min(...prices)}-$${Math.max(...prices)}` : "price n/a"
      return `- ${p.title} (${priceRange}): ${p.description}`
    })
    .join("\n")
}
