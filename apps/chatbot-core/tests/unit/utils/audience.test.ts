import { detectAudience, titleMatchesAudience } from "../../../src/utils/audience"

describe("detectAudience", () => {
  it.each([
    ["training shoes for women", "women"],
    ["woman shoes", "women"],
    ["ladies running gear", "women"],
    ["running shoes for men", "men"],
    ["men's jacket", "men"],
    ["shoes for kids", "children"],
    ["a jacket for my boy", "children"],
    ["shoes for girls", "children"],
  ] as const)("detects %s → %s", (text, expected) => {
    expect(detectAudience(text)).toBe(expected)
  })

  it("returns undefined when no audience is mentioned", () => {
    expect(detectAudience("lightweight trail shoes")).toBeUndefined()
  })

  it("does not read 'Women' as 'men'", () => {
    expect(detectAudience("Nike Women Free Run Pink Sports Shoes")).toBe("women")
    expect(detectAudience("Skechers Women Green Shoe")).toBe("women")
  })

  it("does not read brand names like Manchester as 'man'", () => {
    expect(detectAudience("Manchester United Men Solid Black Track Pants")).toBe("men")
  })
})

describe("titleMatchesAudience", () => {
  it("matches products labeled for the requested audience", () => {
    expect(titleMatchesAudience("Skechers Women Green Shoe", "women")).toBe(true)
    expect(titleMatchesAudience("Puma Men Future Cat Remix SF Black Casual Shoes", "men")).toBe(true)
  })

  it("rejects products labeled for another audience", () => {
    expect(titleMatchesAudience("Puma Men Future Cat Remix SF Black Casual Shoes", "women")).toBe(false)
    expect(titleMatchesAudience("Doodle Boy's Route 66 Biker Blue Teen Kidswear", "women")).toBe(false)
  })

  it("treats unlabeled titles as unisex", () => {
    expect(titleMatchesAudience("Trail Runner X", "women")).toBe(true)
    expect(titleMatchesAudience("Trail Runner X", "men")).toBe(true)
  })
})
