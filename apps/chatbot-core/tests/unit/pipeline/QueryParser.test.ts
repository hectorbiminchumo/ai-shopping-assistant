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

  it("leaves filters undefined when nothing matches", () => {
    const result = parser.parse("something comfortable for the gym")
    expect(result.priceMax).toBeUndefined()
    expect(result.size).toBeUndefined()
    expect(result.category).toBeUndefined()
  })
})
