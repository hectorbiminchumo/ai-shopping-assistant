import { matchScoreToPercent } from "../match-score"

// The display scale maps the calibrated voyage-3 band (0.35–0.55) onto
// 50–99%. These tests pin the agreed anchor points so a future recalibration
// is a conscious change, not an accident.
describe("matchScoreToPercent", () => {
  it("maps the bottom of the band to 50%", () => {
    expect(matchScoreToPercent(0.35)).toBe(50)
  })

  it("maps the top of the band to 99%", () => {
    expect(matchScoreToPercent(0.55)).toBe(99)
  })

  it("maps the no-results threshold (0.40) to ~62%", () => {
    expect(matchScoreToPercent(0.4)).toBe(62)
  })

  it("clamps scores outside the band", () => {
    expect(matchScoreToPercent(0.1)).toBe(50)
    expect(matchScoreToPercent(0.9)).toBe(99)
  })
})
