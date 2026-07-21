// require() rather than import: plain CommonJS JS (allowJs is off). `export {}`
// keeps the top-level bindings out of global scope, so they don't collide with
// the sibling script tests — same pattern as image-ingest-helpers.test.ts.
export {}

const {
  isImageFile,
  labelForRelativePath,
  csvEscape,
  toCsv,
  suggestThreshold,
} = require("../../../scripts/lib/threshold-calibration-helpers.js")

type Sample = {
  file: string
  label: string
  scores?: number[]
  topTitle?: string
  query?: string
  error?: string
}

const sample = (label: string, top: number, file = `${label}/x.jpg`): Sample => ({
  file,
  label,
  scores: [top],
})

describe("isImageFile", () => {
  it.each(["a.jpg", "a.JPG", "a.jpeg", "a.png", "a.webp"])("accepts %s", (name) => {
    expect(isImageFile(name)).toBe(true)
  })

  it.each(["notes.txt", "a.gif", "README", "archive.tar.gz", ".jpg-backup"])(
    "rejects %s",
    (name) => {
      expect(isImageFile(name)).toBe(false)
    }
  )
})

describe("labelForRelativePath", () => {
  it("labels by the sub-directory the file sits in", () => {
    expect(labelForRelativePath("match/shoe.jpg")).toBe("match")
    expect(labelForRelativePath("no-match/kayak.jpg")).toBe("no-match")
  })

  it("treats loose files at the root as unlabeled", () => {
    expect(labelForRelativePath("shoe.jpg")).toBe("unlabeled")
  })

  it("treats unknown sub-directories as unlabeled rather than guessing", () => {
    expect(labelForRelativePath("maybe/shoe.jpg")).toBe("unlabeled")
  })

  it("labels by the top-level directory when files are nested deeper", () => {
    expect(labelForRelativePath("match/shoes/trail.jpg")).toBe("match")
  })
})

describe("csvEscape", () => {
  it("leaves plain values untouched", () => {
    expect(csvEscape("Trail Runner X")).toBe("Trail Runner X")
  })

  it("quotes values containing a comma, quote or newline", () => {
    expect(csvEscape("Shoes, black")).toBe('"Shoes, black"')
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""')
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"')
  })

  it("renders null and undefined as empty", () => {
    expect(csvEscape(undefined)).toBe("")
    expect(csvEscape(null)).toBe("")
  })
})

describe("toCsv", () => {
  it("writes a header plus one row per sample, padding missing scores", () => {
    const csv = toCsv([
      { file: "match/a.jpg", label: "match", scores: [0.4321, 0.2], topTitle: "Trail Runner X" },
    ])
    const [header, row] = csv.trim().split("\n")

    expect(header).toBe(
      "file,label,query,top_score,top_title,score_2,score_3,score_4,score_5,error"
    )
    // 4dp scores, empty cells for the ranks the search didn't return
    expect(row).toBe("match/a.jpg,match,,0.4321,Trail Runner X,0.2000,,,,")
  })

  it("keeps failed samples in the output with their error", () => {
    const csv = toCsv([
      { file: "no-match/b.jpg", label: "no-match", scores: [], error: "Voyage 429" },
    ])
    expect(csv.trim().split("\n")[1]).toBe("no-match/b.jpg,no-match,,,,,,,,Voyage 429")
  })

  it("escapes a product title containing a comma", () => {
    const csv = toCsv([
      { file: "a.jpg", label: "unlabeled", scores: [0.5], topTitle: "Top, black" },
    ])
    expect(csv).toContain('"Top, black"')
  })
})

describe("suggestThreshold", () => {
  it("refuses to suggest a cutoff without both populations", () => {
    const result = suggestThreshold([sample("match", 0.3)])
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no-match/)
  })

  it("ignores unlabeled samples when deciding", () => {
    const result = suggestThreshold([
      sample("match", 0.3),
      sample("unlabeled", 0.99),
      sample("no-match", 0.1),
    ])
    expect(result.matchCount).toBe(1)
    expect(result.noMatchCount).toBe(1)
    // 0.99 would have dragged the cutoff up had it counted
    expect(result.threshold).toBe(0.2)
  })

  it("takes the midpoint of the gap when the populations separate cleanly", () => {
    const result = suggestThreshold([
      sample("match", 0.30),
      sample("match", 0.26),
      sample("no-match", 0.14),
      sample("no-match", 0.10),
    ])
    expect(result.separated).toBe(true)
    expect(result.threshold).toBe(0.2)
    expect(result.falseLostSales).toBe(0)
    expect(result.falsePositives).toBe(0)
  })

  // Several cutoffs can tie on error count. Hugging a measured score would be
  // overfitting — one new photo scoring marginally higher flips it.
  it("centres the cutoff in the widest gap when several tie on error count", () => {
    const result = suggestThreshold([
      sample("match", 0.5),
      sample("match", 0.2), // outlier inside the no-match range
      sample("no-match", 0.3),
      sample("no-match", 0.1),
    ])
    // 0.2 and 0.5 both leave exactly one error; the midpoint between them sits
    // furthest from any sample
    expect(result.threshold).toBe(0.35)
    expect(result.errors).toBe(1)
  })

  it("reports the overlap instead of a clean midpoint when the ranges cross", () => {
    const result = suggestThreshold([
      sample("match", 0.30),
      sample("match", 0.12), // sits inside the no-match range
      sample("no-match", 0.20),
      sample("no-match", 0.10),
    ])
    expect(result.ok).toBe(true)
    expect(result.separated).toBe(false)
    expect(result.falseLostSales + result.falsePositives).toBeGreaterThan(0)
  })

  it("skips samples whose search failed rather than scoring them as 0", () => {
    const result = suggestThreshold([
      sample("match", 0.30),
      { file: "match/failed.jpg", label: "match", scores: [], error: "Voyage 429" },
      sample("no-match", 0.10),
    ])
    // A 0 from a failed call would have looked like the worst possible match
    expect(result.matchCount).toBe(1)
    expect(result.minMatch).toBe(0.3)
  })

  it("reports the real score ranges so the numbers can go in the ticket", () => {
    const result = suggestThreshold([
      sample("match", 0.252),
      sample("match", 0.31),
      sample("no-match", 0.09),
      sample("no-match", 0.15),
    ])
    expect(result).toMatchObject({
      minMatch: 0.252,
      maxMatch: 0.31,
      minNoMatch: 0.09,
      maxNoMatch: 0.15,
    })
  })
})
