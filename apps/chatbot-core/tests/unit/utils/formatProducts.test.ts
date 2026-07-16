import { formatProductsForPrompt } from "../../../src/utils/formatProducts"
import { SIMILARITY_THRESHOLD } from "../../../src/utils/scoreFilter"
import type { Product, ProductVariant, RetrievalResult } from "../../../src/types"

// Small builders so each test states only the fields it cares about.
function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "var_1",
    title: "42 / Black",
    sku: "SKU-1",
    price: 90,
    inventoryQuantity: 5,
    options: { size: "42", color: "Black" },
    ...overrides,
  }
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_1",
    medusaProductId: "medusa_1",
    title: "Trail Runner X",
    description: "A lightweight trail running shoe.",
    category: "running shoes",
    tags: ["trail", "running"],
    variants: [makeVariant()],
    ...overrides,
  }
}

function makeResult(product: Product, similarityScore: number): RetrievalResult {
  return { product, similarityScore }
}

describe("formatProductsForPrompt", () => {
  describe("price range formatting", () => {
    it("shows a min-max range when variant prices differ", () => {
      const product = makeProduct({
        variants: [
          makeVariant({ id: "a", price: 80 }),
          makeVariant({ id: "b", price: 120 }),
        ],
      })

      const output = formatProductsForPrompt([makeResult(product, 0.82)])

      expect(output).toContain("Price: $80-$120")
    })

    it("shows a single price when all variant prices are equal", () => {
      const product = makeProduct({
        variants: [
          makeVariant({ id: "a", price: 90 }),
          makeVariant({ id: "b", price: 90 }),
        ],
      })

      const output = formatProductsForPrompt([makeResult(product, 0.82)])

      expect(output).toContain("Price: $90")
      expect(output).not.toContain("$90-$90")
    })

    it("falls back to priceMin/priceMax when the product has no variants", () => {
      const product = makeProduct({ variants: [], priceMin: 50, priceMax: 75 })

      const output = formatProductsForPrompt([makeResult(product, 0.82)])

      expect(output).toContain("Price: $50-$75")
    })

    it("shows 'price n/a' when there are no variants and no priceMin", () => {
      const product = makeProduct({ variants: [], priceMin: undefined, priceMax: undefined })

      const output = formatProductsForPrompt([makeResult(product, 0.82)])

      expect(output).toContain("Price: price n/a")
    })
  })

  describe("availability", () => {
    it("lists only in-stock sizes and colors, de-duplicated", () => {
      const product = makeProduct({
        variants: [
          makeVariant({ id: "a", inventoryQuantity: 3, options: { size: "42", color: "Black" } }),
          makeVariant({ id: "b", inventoryQuantity: 2, options: { size: "43", color: "Black" } }),
          // Out of stock — its size/color must not appear.
          makeVariant({ id: "c", inventoryQuantity: 0, options: { size: "44", color: "Red" } }),
        ],
      })

      const output = formatProductsForPrompt([makeResult(product, 0.82)])

      expect(output).toContain("Sizes in stock: 42, 43")
      expect(output).toContain("Colors: Black")
      expect(output).not.toContain("44")
      expect(output).not.toContain("Red")
    })

    it("labels a product 'Out of stock' when every variant has zero inventory", () => {
      const product = makeProduct({
        variants: [
          makeVariant({ id: "a", inventoryQuantity: 0 }),
          makeVariant({ id: "b", inventoryQuantity: 0 }),
        ],
      })

      const output = formatProductsForPrompt([makeResult(product, 0.82)])

      expect(output).toContain("Out of stock")
      expect(output).not.toContain("Sizes in stock")
    })
  })

  describe("match labels", () => {
    it("labels a product at the similarity threshold a 'strong match'", () => {
      const output = formatProductsForPrompt([
        makeResult(makeProduct(), SIMILARITY_THRESHOLD),
      ])

      expect(output).toContain("(strong match)")
      expect(output).not.toContain("(partial match)")
    })

    it("labels a product just below the threshold a 'partial match'", () => {
      const output = formatProductsForPrompt([
        makeResult(makeProduct(), SIMILARITY_THRESHOLD - 0.01),
      ])

      expect(output).toContain("(partial match)")
      expect(output).not.toContain("(strong match)")
    })
  })

  describe("relevance ordering", () => {
    it("sorts results by descending similarity and numbers them from 1", () => {
      const low = makeProduct({ id: "low", title: "Low Match Shoe" })
      const high = makeProduct({ id: "high", title: "High Match Shoe" })
      const mid = makeProduct({ id: "mid", title: "Mid Match Shoe" })

      // Deliberately unsorted input.
      const output = formatProductsForPrompt([
        makeResult(low, 0.41),
        makeResult(high, 0.88),
        makeResult(mid, 0.63),
      ])

      expect(output).toContain("1. High Match Shoe")
      expect(output).toContain("2. Mid Match Shoe")
      expect(output).toContain("3. Low Match Shoe")

      // Ordering is by score, not input order.
      expect(output.indexOf("High Match Shoe")).toBeLessThan(output.indexOf("Mid Match Shoe"))
      expect(output.indexOf("Mid Match Shoe")).toBeLessThan(output.indexOf("Low Match Shoe"))
    })

    it("does not mutate the caller's array", () => {
      const results = [
        makeResult(makeProduct({ id: "a", title: "A" }), 0.41),
        makeResult(makeProduct({ id: "b", title: "B" }), 0.88),
      ]

      formatProductsForPrompt(results)

      expect(results[0].product.title).toBe("A")
      expect(results[1].product.title).toBe("B")
    })
  })

  it("returns an empty string when there are no results", () => {
    expect(formatProductsForPrompt([])).toBe("")
  })
})
