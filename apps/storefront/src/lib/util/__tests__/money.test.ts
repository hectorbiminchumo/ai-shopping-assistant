import { convertToLocale } from "../money"

describe("convertToLocale", () => {
  it("formats an amount as currency without scaling it (no cents division)", () => {
    // Medusa V2 calculated_amount is already in major units — 99 must read $99, not $0.99.
    const result = convertToLocale({
      amount: 99,
      currency_code: "usd",
      minimumFractionDigits: 0,
    })
    expect(result).toBe("$99")
  })

  it("keeps decimals when fraction digits are not forced to 0", () => {
    expect(convertToLocale({ amount: 99.9, currency_code: "usd" })).toBe("$99.90")
  })

  it("respects the currency code", () => {
    const result = convertToLocale({
      amount: 50,
      currency_code: "eur",
      minimumFractionDigits: 0,
    })
    // Symbol/placement varies by locale; assert the value and currency are present.
    expect(result).toContain("50")
    expect(result).toMatch(/€|EUR/)
  })

  it("falls back to the raw string when currency code is empty", () => {
    expect(convertToLocale({ amount: 42, currency_code: "" })).toBe("42")
  })
})
