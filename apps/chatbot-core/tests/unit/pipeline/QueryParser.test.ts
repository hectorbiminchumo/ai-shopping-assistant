import { QueryParser } from "../../../src/pipeline/QueryParser"

describe("QueryParser", () => {
  const parser = new QueryParser()

  it("extracts a price ceiling from the query", () => {
    const result = parser.parse("running shoes under $80")
    expect(result.priceMax).toBe(80)
  })

  it("extracts a price floor from the query", () => {
    expect(parser.parse("running shoes above $50").priceMin).toBe(50)
    expect(parser.parse("jackets at least $30").priceMin).toBe(30)
  })

  it("extracts a size from the query", () => {
    const result = parser.parse("trail shoes size 42")
    expect(result.size).toBe("42")
  })

  it("leaves priceMax undefined for a negative price in free text", () => {
    // The regex never captures a sign, so "-$80" simply fails to match.
    const result = parser.parse("running shoes under -$80")
    expect(result.priceMax).toBeUndefined()
  })

  it("leaves priceMax undefined for a non-numeric price in free text", () => {
    const result = parser.parse("running shoes under a lot of money")
    expect(result.priceMax).toBeUndefined()
  })

  it("leaves size undefined for a malformed size in free text", () => {
    expect(parser.parse("trail shoes size XL").size).toBeUndefined()
    expect(parser.parse("trail shoes size -1").size).toBeUndefined()
  })

  it("matches a known category mentioned in the query", () => {
    const result = parser.parse("looking for running shoes", ["running shoes", "jackets"])
    expect(result.category).toBe("running shoes")
  })

  it("matches slug categories against plain words in the query", () => {
    const result = parser.parse("Hello I need running shoes for men", [
      "running-shoes",
      "training-apparel",
      "jackets",
    ])
    expect(result.category).toBe("running-shoes")
  })

  it("matches categories regardless of casing and punctuation", () => {
    const result = parser.parse("any Training Apparel?", ["running-shoes", "training-apparel"])
    expect(result.category).toBe("training-apparel")
  })

  it("matches categories with reordered or stemmed words", () => {
    const categories = ["running-shoes", "training-apparel", "jackets"]
    expect(parser.parse("women shoes for run", categories).category).toBe("running-shoes")
    expect(parser.parse("shoes for running", categories).category).toBe("running-shoes")
    expect(parser.parse("a warm jacket", categories).category).toBe("jackets")
  })

  it("does not match a category when only part of its name appears", () => {
    const categories = ["running-shoes", "training-apparel"]
    // "training" alone must not trigger training-apparel for a shoe request
    expect(parser.parse("training shoes for women", categories).category).toBeUndefined()
  })

  it("leaves category undefined when the mentioned category is unknown to the catalog", () => {
    const categories = ["running-shoes", "training-apparel"]
    const result = parser.parse("looking for swimwear", categories)
    expect(result.category).toBeUndefined()
  })

  it("detects the audience mentioned in the query", () => {
    expect(parser.parse("training shoes for women").audience).toBe("women")
    expect(parser.parse("running shoes for men").audience).toBe("men")
    expect(parser.parse("sneakers for kids").audience).toBe("children")
  })

  it("leaves filters undefined when nothing matches", () => {
    const result = parser.parse("something comfortable for the gym")
    expect(result.priceMax).toBeUndefined()
    expect(result.size).toBeUndefined()
    expect(result.category).toBeUndefined()
    expect(result.audience).toBeUndefined()
  })

  describe("embeddingText", () => {
    it("strips a price ceiling phrase so it doesn't skew the semantic embedding", () => {
      const result = parser.parse("training shoes for men under 115 usd")
      expect(result.priceMax).toBe(115)
      expect(result.embeddingText).toBe("training shoes for men")
    })

    it("strips a price floor phrase", () => {
      const result = parser.parse("jackets above $50")
      expect(result.embeddingText).toBe("jackets")
    })

    it("strips a size phrase", () => {
      const result = parser.parse("trail shoes size 42")
      expect(result.embeddingText).toBe("trail shoes")
    })

    it("strips multiple matched phrases at once", () => {
      const result = parser.parse("trail shoes size 42 under $150")
      expect(result.embeddingText).toBe("trail shoes")
    })

    it("keeps rawQuery unchanged — only embeddingText is stripped", () => {
      const result = parser.parse("trail shoes size 42")
      expect(result.rawQuery).toBe("trail shoes size 42")
      expect(result.embeddingText).toBe("trail shoes")
    })

    it("leaves embeddingText equal to rawQuery when nothing matches", () => {
      const result = parser.parse("something comfortable for the gym")
      expect(result.embeddingText).toBe("something comfortable for the gym")
    })
  })
})
