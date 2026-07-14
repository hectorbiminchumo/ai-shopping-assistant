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

    it("matches recommended products by title named in the text, not a miscounted trailer index", () => {
      const vans: Product = {
        ...product,
        id: "prod_vans",
        medusaProductId: "medusa_vans",
        title: "Vans Men Khaki Shoes",
      }
      const idShoes: Product = {
        ...product,
        id: "prod_id",
        medusaProductId: "medusa_id",
        title: "ID Men Red Shoes",
      }
      const tshirt: Product = {
        ...product,
        id: "prod_tshirt",
        medusaProductId: "medusa_tshirt",
        title: "Nike Men Printed Black T-shirt",
      }
      // Trailer indices 1 and 2 point at the t-shirt and the ID shoes — but
      // the prose actually names Vans and ID shoes, not the t-shirt at all.
      const retrievedMismatch: RetrievalResult[] = [
        { product: tshirt, similarityScore: 0.42 },
        { product: idShoes, similarityScore: 0.42 },
        { product: vans, similarityScore: 0.4 },
      ]

      const response = formatter.format(
        "I recommend the Vans Men Khaki Shoes. As an alternative, consider the ID Men Red Shoes." +
          "\nRECOMMENDED: 1, 2",
        retrievedMismatch
      )

      // Ordered by mention in the prose (Vans first), not by retrieval rank
      expect(response.products.map((p) => p.title)).toEqual([
        "Vans Men Khaki Shoes",
        "ID Men Red Shoes",
      ])
    })

    it("drops a cross-category alternative even when the LLM names it and admits it doesn't fit", () => {
      // Real bug: only one actual shoe survived the price filter, so the LLM
      // padded the reply with a t-shirt "alternative" — explicitly admitting
      // it's not a shoe — despite the system prompt forbidding that.
      const vans: Product = {
        ...product,
        id: "prod_vans",
        medusaProductId: "medusa_vans",
        title: "Vans Men Khaki Shoes",
        category: "running-shoes",
      }
      const tshirt: Product = {
        ...product,
        id: "prod_tshirt",
        medusaProductId: "medusa_tshirt",
        title: "Nike Men Printed Black T-shirt",
        category: "training-apparel",
      }
      const retrievedCrossCategory: RetrievalResult[] = [
        { product: tshirt, similarityScore: 0.43 },
        { product: vans, similarityScore: 0.45 },
      ]

      const response = formatter.format(
        "For men's training shoes under $100, I recommend the Vans Men Khaki Shoes. As an " +
          "alternative, you might consider the Nike Men Printed Black T-shirt, which is great " +
          "for workouts, but please note it's a t-shirt, not a shoe." +
          "\nRECOMMENDED: 1, 2",
        retrievedCrossCategory
      )

      expect(response.products.map((p) => p.title)).toEqual(["Vans Men Khaki Shoes"])
    })

    it("still matches a title when the LLM adds a grammatical possessive not in the actual title", () => {
      // Real bug: catalog title has no apostrophe, but the LLM wrote
      // "ADIDAS Men's Sports..." — a naive substring check missed this
      // entirely and silently dropped the card.
      const adidas: Product = {
        ...product,
        id: "prod_adidas",
        medusaProductId: "medusa_adidas",
        title: "ADIDAS Men Sports Black Sports Shoes",
      }
      const retrievedAdidas: RetrievalResult[] = [{ product: adidas, similarityScore: 0.5 }]

      const response = formatter.format(
        "I recommend the ADIDAS Men's Sports Black Sports Shoes for training.\nRECOMMENDED: 1",
        retrievedAdidas
      )

      expect(response.products.map((p) => p.title)).toEqual([
        "ADIDAS Men Sports Black Sports Shoes",
      ])
    })

    it("falls back to a generic message when the LLM reply is only the trailer", () => {
      const response = formatter.format("RECOMMENDED: none", retrieved)
      expect(response.message).toBe(
        "Sorry, could you rephrase that? I didn't quite catch what you're looking for."
      )
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
