import { QueryParser } from "../../../src/pipeline/QueryParser"

describe("QueryParser", () => {
  const parser = new QueryParser()

  it("extracts a price ceiling from the query", () => {
    const result = parser.parse("running shoes under $80")
    expect(result.priceMax).toBe(80)
  })

  it("extracts a size from the query", () => {
    const result = parser.parse("trail shoes size 42")
    expect(result.size).toBe("42")
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
})
