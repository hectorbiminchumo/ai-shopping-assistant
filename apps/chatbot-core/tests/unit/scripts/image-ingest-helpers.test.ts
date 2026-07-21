// require() rather than import: this is plain CommonJS JS (allowJs is off), so
// a static import of the untyped path would fail type-checking. Mirrors
// ingest-helpers.test.ts.
// `export {}` makes this file a module so its top-level require() bindings
// (loadConfig, etc.) don't collide in global scope with the sibling
// ingest-helpers.test.ts, which declares the same names.
export {}

const {
  loadConfig,
  parseImageMap,
  detectMimeType,
  createImageEmbedder,
  createSupabaseImageStore,
  runImageIngestion,
} = require("../../../scripts/lib/image-ingest-helpers.js")

// A retry that runs the fn once with no delay — keeps error-path tests fast.
const noDelayRetry = (fn: () => unknown) => fn()

describe("loadConfig", () => {
  const validEnv = {
    VOYAGE_API_KEY: "voyage-key",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    VOYAGE_MULTIMODAL_MODEL: "voyage-multimodal-3.5",
    VOYAGE_API_BASE_URL: "https://api.voyageai.com/v1",
  }

  it("reads the model and base URL from the environment", () => {
    const cfg = loadConfig(validEnv)
    expect(cfg.model).toBe("voyage-multimodal-3.5")
    expect(cfg.voyageBaseUrl).toBe("https://api.voyageai.com/v1")
  })

  it("throws listing every missing required env var (including model + base URL)", () => {
    expect(() => loadConfig({})).toThrow(
      "VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_MULTIMODAL_MODEL, VOYAGE_API_BASE_URL"
    )
  })
})

describe("parseImageMap", () => {
  it("maps title to the thumbnail URL", () => {
    const csv = "title,thumbnail,images\nShoe A,http://s/a.jpg,http://s/a.jpg\nShoe B,http://s/b.jpg,"
    const map = parseImageMap(csv)
    expect(map.get("Shoe A")).toBe("http://s/a.jpg")
    expect(map.get("Shoe B")).toBe("http://s/b.jpg")
  })

  it("falls back to the first images entry when thumbnail is empty", () => {
    const csv = "title,thumbnail,images\nShoe A,,http://s/a1.jpg|http://s/a2.jpg"
    expect(parseImageMap(csv).get("Shoe A")).toBe("http://s/a1.jpg")
  })

  it("skips rows with no title or no image URL", () => {
    const csv = "title,thumbnail,images\nShoe A,,\n,http://s/x.jpg,"
    expect(parseImageMap(csv).size).toBe(0)
  })

  it("throws when the required columns are absent", () => {
    expect(() => parseImageMap("name,price\nx,1")).toThrow(/title/)
  })
})

describe("detectMimeType", () => {
  it("detects jpeg, png, webp, gif from magic bytes", () => {
    expect(detectMimeType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg")
    expect(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png")
    expect(
      detectMimeType(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]))
    ).toBe("image/webp")
    expect(detectMimeType(Buffer.from("GIF89a"))).toBe("image/gif")
  })

  it("throws on an unknown format", () => {
    expect(() => detectMimeType(Buffer.from([0, 1, 2, 3]))).toThrow(/Unsupported/)
  })
})

describe("createImageEmbedder", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00])

  function fetchReturning(response: unknown, ok = true, status = 200) {
    return jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => response,
      text: async () => JSON.stringify(response),
    })
  }

  const opts = { apiKey: "k", model: "voyage-multimodal-3.5", baseUrl: "https://api.voyageai.com/v1", retry: noDelayRetry }

  it("returns the 512d vector and sends model + output_dimension", async () => {
    const fetchImpl = fetchReturning({ data: [{ embedding: Array(512).fill(0.1) }] })
    const embedder = createImageEmbedder({ ...opts, fetchImpl })

    const vec = await embedder.embedImage(jpeg)

    expect(vec).toHaveLength(512)
    const [url, req] = fetchImpl.mock.calls[0]
    expect(url).toBe("https://api.voyageai.com/v1/multimodalembeddings")
    const body = JSON.parse(req.body)
    expect(body.model).toBe("voyage-multimodal-3.5")
    expect(body.output_dimension).toBe(512)
    expect(body.inputs[0].content[0].image_base64).toMatch(/^data:image\/jpeg;base64,/)
  })

  it("throws on a non-2xx response", async () => {
    const fetchImpl = fetchReturning({ detail: "rate limit" }, false, 429)
    const embedder = createImageEmbedder({ ...opts, fetchImpl })
    await expect(embedder.embedImage(jpeg)).rejects.toThrow(/429/)
  })

  it("throws when the dimension is not 512", async () => {
    const fetchImpl = fetchReturning({ data: [{ embedding: Array(1024).fill(0) }] })
    const embedder = createImageEmbedder({ ...opts, fetchImpl })
    await expect(embedder.embedImage(jpeg)).rejects.toThrow(/dimension/)
  })
})

describe("createSupabaseImageStore", () => {
  it("PATCHes image_embedding for the matching medusa_product_id", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true })
    const store = createSupabaseImageStore({ url: "https://s.co", serviceRoleKey: "srk", fetchImpl })

    await store.updateImageEmbedding("prod_1", [0.1, 0.2])

    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toContain("medusa_product_id=eq.prod_1")
    expect(opts.method).toBe("PATCH")
    expect(JSON.parse(opts.body).image_embedding).toEqual([0.1, 0.2])
  })

  it("countIndexed parses the content-range total", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      headers: { get: () => "0-23/24" },
    })
    const store = createSupabaseImageStore({ url: "https://s.co", serviceRoleKey: "srk", fetchImpl })
    expect(await store.countIndexed()).toBe(24)
  })
})

describe("runImageIngestion", () => {
  const products = [
    { title: "Has Image", medusa_product_id: "p1" },
    { title: "No Image", medusa_product_id: "p2" },
  ]
  const imageMap = new Map([["Has Image", "http://s/1.jpg"]])

  it("embeds and upserts products with an image, skips those without", async () => {
    const embedder = { embedImage: jest.fn().mockResolvedValue(Array(512).fill(0)) }
    const store = { updateImageEmbedding: jest.fn().mockResolvedValue(undefined) }
    const download = jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]))

    const stats = await runImageIngestion({ products, imageMap, dryRun: false, embedder, store, download })

    expect(stats).toEqual({ ok: 1, skipped: 1, failed: 0 })
    expect(store.updateImageEmbedding).toHaveBeenCalledWith("p1", expect.any(Array))
    expect(store.updateImageEmbedding).toHaveBeenCalledTimes(1)
  })

  it("does not write in dry-run mode", async () => {
    const embedder = { embedImage: jest.fn().mockResolvedValue(Array(512).fill(0)) }
    const store = { updateImageEmbedding: jest.fn() }
    const download = jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]))

    const stats = await runImageIngestion({ products, imageMap, dryRun: true, embedder, store, download })

    expect(stats.ok).toBe(1)
    expect(store.updateImageEmbedding).not.toHaveBeenCalled()
  })

  it("counts a product as failed when embedding throws, and continues", async () => {
    const embedder = { embedImage: jest.fn().mockRejectedValue(new Error("boom")) }
    const store = { updateImageEmbedding: jest.fn() }
    const download = jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]))

    const stats = await runImageIngestion({ products, imageMap, dryRun: false, embedder, store, download })

    expect(stats).toEqual({ ok: 0, skipped: 1, failed: 1 })
  })
})
