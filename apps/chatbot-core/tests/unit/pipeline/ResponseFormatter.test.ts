import { ResponseFormatter } from "../../../src/pipeline/ResponseFormatter"
import type { Product, RetrievalResult } from "../../../src/types"

const product: Product = {
  id: "prod_1",
  medusaProductId: "medusa_1",
  title: "Trail Runner X",
  description: "A lightweight trail running shoe.",
  tags: [],
  variants: [
    { id: "var_1", title: "41", sku: "TRX-41", price: 85, inventoryQuantity: 3, options: {} },
    { id: "var_2", title: "42", sku: "TRX-42", price: 95, inventoryQuantity: 5, options: {} },
  ],
}

describe("ResponseFormatter", () => {
  const formatter = new ResponseFormatter()

  it("maps retrieval results to product cards with min/max price", () => {
    const result: RetrievalResult = { product, similarityScore: 0.75 }
    const response = formatter.format("Here are some options.", [result])

    expect(response.products).toEqual([
      {
        id: "prod_1",
        medusaProductId: "medusa_1",
        title: "Trail Runner X",
        thumbnailUrl: undefined,
        priceMin: 85,
        priceMax: 95,
        similarityScore: 0.75,
      },
    ])
  })

  it("marks hasResults true when the top score meets the similarity threshold", () => {
    const response = formatter.format("ok", [{ product, similarityScore: 0.6 }])
    expect(response.hasResults).toBe(true)
  })

  it("marks hasResults false when the top score is below the similarity threshold", () => {
    const response = formatter.format("ok", [{ product, similarityScore: 0.35 }])
    expect(response.hasResults).toBe(false)
  })

  it("marks hasResults false when nothing was retrieved", () => {
    const response = formatter.format("no matches", [])
    expect(response.hasResults).toBe(false)
  })

  describe("RECOMMENDED trailer", () => {
    const second: Product = {
      ...product,
      id: "prod_2",
      medusaProductId: "medusa_2",
      title: "Gym Flex Trainer",
    }
    const retrieved: RetrievalResult[] = [
      { product, similarityScore: 0.48 },
      { product: second, similarityScore: 0.44 },
    ]

    it("keeps only the products the LLM recommended and strips the trailer", () => {
      const response = formatter.format(
        "The Gym Flex Trainer is your best option.\nRECOMMENDED: 2",
        retrieved
      )

      expect(response.message).toBe("The Gym Flex Trainer is your best option.")
      expect(response.products.map((p) => p.id)).toEqual(["prod_2"])
    })

    it("returns no cards when the LLM recommends none (e.g. clarifying question)", () => {
      const response = formatter.format(
        "Is this for men, women or children?\nRECOMMENDED: none",
        retrieved
      )

      expect(response.message).toBe("Is this for men, women or children?")
      expect(response.products).toEqual([])
      expect(response.hasResults).toBe(true)
    })

    it("ignores out-of-range numbers in the trailer", () => {
      const response = formatter.format("Take the first one.\nRECOMMENDED: 1, 7", retrieved)
      expect(response.products.map((p) => p.id)).toEqual(["prod_1"])
    })

    it("similarityThresholdMet is true when the recommended product's real score meets the threshold", () => {
      const response = formatter.format(
        "The Gym Flex Trainer is your best option.\nRECOMMENDED: 2",
        retrieved
      )
      expect(response.similarityThresholdMet).toBe(true)
    })

    it("similarityThresholdMet reflects the recommended product's real score, unlike hasResults", () => {
      const weakMatch: RetrievalResult[] = [{ product, similarityScore: 0.32 }]
      const response = formatter.format(
        "The Trail Runner X is a decent option.\nRECOMMENDED: 1",
        weakMatch
      )

      // The LLM chose to recommend it anyway — the storefront still shows the card
      expect(response.hasResults).toBe(true)
      // But the real score is below SIMILARITY_THRESHOLD — analytics should see this as a weak match
      expect(response.similarityThresholdMet).toBe(false)
    })

    it("falls back to the similarity threshold when no trailer is present", () => {
      const response = formatter.format("Here are some options.", [
        { product, similarityScore: 0.48 },
        { product: second, similarityScore: 0.35 },
      ])

      expect(response.products.map((p) => p.id)).toEqual(["prod_1"])
    })
  })
})
