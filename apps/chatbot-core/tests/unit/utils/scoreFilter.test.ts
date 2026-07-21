import {
  IMAGE_SIMILARITY_THRESHOLD,
  meetsImageSimilarityThreshold,
  meetsSimilarityThreshold,
  SIMILARITY_THRESHOLD,
} from "../../../src/utils/scoreFilter"

describe("scoreFilter", () => {
  describe("image threshold (voyage-multimodal-3.5)", () => {
    it("is calibrated at 0.42", () => {
      expect(IMAGE_SIMILARITY_THRESHOLD).toBe(0.42)
    })

    it.each([
      [0.42, true],
      [0.419, false],
      // Bracket the measured populations: the lowest real match (0.4401) must
      // pass and the highest real no-match (0.4140) must not — see the
      // calibration note in scoreFilter.ts.
      [0.4401, true],
      [0.414, false],
      [0.99, true],
      [0, false],
    ])("meetsImageSimilarityThreshold(%p) -> %p", (score, expected) => {
      expect(meetsImageSimilarityThreshold(score)).toBe(expected)
    })
  })

  describe("text threshold (voyage-3)", () => {
    it("is calibrated at 0.40", () => {
      expect(SIMILARITY_THRESHOLD).toBe(0.4)
    })

    it.each([
      [0.4, true],
      [0.399, false],
      [0.9, true],
      [0, false],
    ])("meetsSimilarityThreshold(%p) -> %p", (score, expected) => {
      expect(meetsSimilarityThreshold(score)).toBe(expected)
    })
  })
})
