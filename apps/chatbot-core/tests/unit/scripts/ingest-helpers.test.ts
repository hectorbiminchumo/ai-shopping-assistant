// Loaded via require() rather than a static import: this module is plain
// CommonJS JS (not compiled TS), and the project's tsconfig has `allowJs`
// off, so a static `import` of the untyped path would fail type-checking.
// `require()` resolves to `any` and needs no tsconfig changes.
const {
  parseArgs,
  loadConfig,
  buildEmbeddingText,
  buildEmbeddingRow,
  withRetry,
  parseJson,
  parseCsv,
  splitCsvLine,
  validateProduct,
  createMedusaClient,
  createSupabaseUpserter,
  createVoyageEmbedder,
  runIngestion,
} = require("../../../scripts/lib/ingest-helpers.js")

describe("parseArgs", () => {
  it("parses --file and --dry-run", () => {
    expect(parseArgs(["--file", "./data.json", "--dry-run"])).toEqual({
      fileArg: "./data.json",
      dryRun: true,
    })
  })

  it("defaults dryRun to false when the flag is absent", () => {
    expect(parseArgs(["--file", "./data.json"])).toEqual({
      fileArg: "./data.json",
      dryRun: false,
    })
  })

  it("throws when --file is missing", () => {
    expect(() => parseArgs([])).toThrow("--file <path> is required")
  })
})

describe("loadConfig", () => {
  const validEnv = {
    VOYAGE_API_KEY: "voyage-key",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  }

  it("returns config with defaults for absent optional vars", () => {
    expect(loadConfig(validEnv)).toEqual({
      voyageApiKey: "voyage-key",
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "service-role-key",
      medusaBackendUrl: "http://localhost:9000",
      medusaAdminEmail: undefined,
      medusaAdminPassword: undefined,
    })
  })

  it("strips a trailing slash from MEDUSA_BACKEND_URL", () => {
    const config = loadConfig({ ...validEnv, MEDUSA_BACKEND_URL: "https://medusa.example.com/" })
    expect(config.medusaBackendUrl).toBe("https://medusa.example.com")
  })

  it("throws listing every missing required env var", () => {
    expect(() => loadConfig({})).toThrow("VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
  })
})

describe("buildEmbeddingText", () => {
  it("joins title, description, category, and tags with newlines", () => {
    const text = buildEmbeddingText({
      title: "Trail Runner",
      description: "A lightweight trail shoe.",
      category: "running-shoes",
      tags: ["trail", "lightweight"],
    })
    expect(text).toBe("Trail Runner\nA lightweight trail shoe.\nrunning-shoes\ntrail lightweight")
  })

  it("omits a missing category and empty tags", () => {
    const text = buildEmbeddingText({
      title: "Trail Runner",
      description: "A lightweight trail shoe.",
      tags: [],
    })
    expect(text).toBe("Trail Runner\nA lightweight trail shoe.")
  })

  it("falls back gracefully when tags is not an array", () => {
    const text = buildEmbeddingText({
      title: "Trail Runner",
      description: "A lightweight trail shoe.",
      tags: "trail|lightweight",
    })
    expect(text).toBe("Trail Runner\nA lightweight trail shoe.\ntrail|lightweight")
  })
})

describe("buildEmbeddingRow", () => {
  it("builds the upsert row, defaulting missing optional fields to null", () => {
    const row = buildEmbeddingRow(
      { medusa_product_id: "prod_1", title: "Trail Runner", description: "desc" },
      [0.1, 0.2],
      () => "2026-01-01T00:00:00.000Z"
    )
    expect(row).toEqual({
      medusa_product_id: "prod_1",
      title: "Trail Runner",
      description: "desc",
      category: null,
      tags: [],
      price_min: null,
      price_max: null,
      thumbnail_url: null,
      embedding: [0.1, 0.2],
      updated_at: "2026-01-01T00:00:00.000Z",
    })
  })
})

describe("parseJson", () => {
  it("returns the parsed array", () => {
    expect(parseJson('[{"title":"a"}]')).toEqual([{ title: "a" }])
  })

  it("rejects non-array input", () => {
    expect(() => parseJson('{"title":"a"}')).toThrow("JSON file must be an array of product objects")
  })
})

describe("splitCsvLine", () => {
  it("splits plain comma-separated fields", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"])
  })

  it("keeps embedded commas inside quoted fields", () => {
    expect(splitCsvLine('a,"b, still b",c')).toEqual(["a", "b, still b", "c"])
  })

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(splitCsvLine('a,"she said ""hi""",c')).toEqual(["a", 'she said "hi"', "c"])
  })
})

describe("parseCsv", () => {
  it("parses rows into product objects, splitting pipe-separated tags", () => {
    const csv = [
      "title,description,category,tags,price_min,price_max,thumbnail_url",
      "Trail Runner,A lightweight shoe,running-shoes,trail|lightweight,50,80,https://example.com/a.jpg",
    ].join("\n")

    expect(parseCsv(csv)).toEqual([
      {
        medusa_product_id: undefined,
        title: "Trail Runner",
        description: "A lightweight shoe",
        category: "running-shoes",
        tags: ["trail", "lightweight"],
        price_min: 50,
        price_max: 80,
        thumbnail_url: "https://example.com/a.jpg",
      },
    ])
  })

  it("throws when a row has a different column count than the header", () => {
    const csv = ["title,description", "Trail Runner"].join("\n")
    expect(() => parseCsv(csv)).toThrow("CSV row 2: expected 2 columns, got 1")
  })

  it("throws when there is no data row", () => {
    expect(() => parseCsv("title,description")).toThrow(
      "CSV must have a header row and at least one data row"
    )
  })
})

describe("validateProduct", () => {
  it("passes for a product with title and description", () => {
    expect(() => validateProduct({ title: "a", description: "b" }, 0)).not.toThrow()
  })

  it("throws when title is missing", () => {
    expect(() => validateProduct({ description: "b" }, 0)).toThrow("Product at index 0: title is required")
  })

  it("throws when description is missing", () => {
    expect(() => validateProduct({ title: "a" }, 1)).toThrow("Product at index 1: description is required")
  })

  it("combines multiple errors into one message", () => {
    expect(() => validateProduct({}, 2)).toThrow(
      "Product at index 2: title is required, description is required"
    )
  })
})

describe("withRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("returns the result once the function succeeds after a failed attempt", async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error("fail once")).mockResolvedValueOnce("ok")

    const promise = withRetry(fn, "test", 3, 10)
    await jest.advanceTimersByTimeAsync(10)

    await expect(promise).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("throws after exhausting all retries", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("always fails"))

    const promise = withRetry(fn, "test", 3, 10)
    promise.catch(() => {}) // avoid unhandled-rejection noise while timers advance

    await jest.advanceTimersByTimeAsync(10)
    await jest.advanceTimersByTimeAsync(20)

    await expect(promise).rejects.toThrow("always fails")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("backs off exponentially between attempts", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce("ok")

    const promise = withRetry(fn, "test", 3, 100)

    await jest.advanceTimersByTimeAsync(100) // backoff after attempt 1: 100ms
    expect(fn).toHaveBeenCalledTimes(2)

    await jest.advanceTimersByTimeAsync(200) // backoff after attempt 2: 200ms
    expect(fn).toHaveBeenCalledTimes(3)

    await expect(promise).resolves.toBe("ok")
  })
})

describe("createMedusaClient", () => {
  it("returns a null token when admin credentials are absent", async () => {
    const client = createMedusaClient({ backendUrl: "http://localhost:9000", fetchImpl: jest.fn() })
    await expect(client.getToken()).resolves.toBeNull()
  })

  it("fetches and caches a token using admin credentials", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "jwt-token" }) })
    const client = createMedusaClient({
      backendUrl: "http://localhost:9000",
      adminEmail: "admin@example.com",
      adminPassword: "secret",
      fetchImpl,
    })

    await expect(client.getToken()).resolves.toBe("jwt-token")
    await expect(client.getToken()).resolves.toBe("jwt-token")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("resolves and caches a product id by title", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "jwt-token" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ products: [{ id: "prod_1", title: "Trail Runner" }] }),
      })

    const client = createMedusaClient({
      backendUrl: "http://localhost:9000",
      adminEmail: "admin@example.com",
      adminPassword: "secret",
      fetchImpl,
    })

    await expect(client.fetchProductId("Trail Runner")).resolves.toBe("prod_1")
    await expect(client.fetchProductId("Trail Runner")).resolves.toBe("prod_1")
    expect(fetchImpl).toHaveBeenCalledTimes(2) // second lookup served from the id cache
  })

  it("returns null when no matching product is found", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "jwt-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ products: [] }) })

    const client = createMedusaClient({
      backendUrl: "http://localhost:9000",
      adminEmail: "admin@example.com",
      adminPassword: "secret",
      fetchImpl,
    })

    await expect(client.fetchProductId("Unknown")).resolves.toBeNull()
  })
})

describe("createSupabaseUpserter", () => {
  it("upserts a row without throwing on success", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true })
    const upserter = createSupabaseUpserter({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl,
    })

    await expect(upserter.upsertEmbedding({ title: "a" })).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/product_embeddings",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("throws with the status and body when the response is not ok", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 409, text: async () => "conflict" })
    const upserter = createSupabaseUpserter({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl,
    })

    await expect(upserter.upsertEmbedding({ title: "a" })).rejects.toThrow("Supabase upsert failed: 409")
  })
})

describe("createVoyageEmbedder", () => {
  it("returns embeddings from a successful batch response", async () => {
    const voyage = {
      embed: jest.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
    }
    const embedder = createVoyageEmbedder({ voyage })

    await expect(embedder.embedBatch(["chunk a", "chunk b"])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ])
    expect(voyage.embed).toHaveBeenCalledWith({ input: ["chunk a", "chunk b"], model: "voyage-3" })
  })

  it("throws on an empty batch response", async () => {
    const voyage = { embed: jest.fn().mockResolvedValue({ data: [] }) }
    const embedder = createVoyageEmbedder({ voyage, retry: (fn: () => unknown) => fn() })

    await expect(embedder.embedBatch(["chunk"])).rejects.toThrow("Empty batch response from Voyage AI")
  })

  it("throws when an item in the batch response is missing its embedding", async () => {
    const voyage = { embed: jest.fn().mockResolvedValue({ data: [{}] }) }
    const embedder = createVoyageEmbedder({ voyage, retry: (fn: () => unknown) => fn() })

    await expect(embedder.embedBatch(["chunk"])).rejects.toThrow("Missing embedding in batch response")
  })
})

describe("runIngestion", () => {
  it("in dry-run mode skips Medusa resolution and Supabase writes, but reports all products ok", async () => {
    const products = [
      { title: "Trail Runner", description: "desc" },
      { title: "Road Racer", description: "desc" },
    ]
    const medusaClient = { fetchProductId: jest.fn(), getToken: jest.fn() }
    const supabaseUpserter = { upsertEmbedding: jest.fn() }
    const embedder = { embedBatch: jest.fn() }

    const stats = await runIngestion(products, { dryRun: true, medusaClient, embedder, supabaseUpserter })

    expect(stats).toEqual({ ok: 2, failed: 0 })
    expect(medusaClient.fetchProductId).not.toHaveBeenCalled()
    expect(supabaseUpserter.upsertEmbedding).not.toHaveBeenCalled()
    expect(embedder.embedBatch).not.toHaveBeenCalled()
  })

  it("in live mode resolves ids, embeds, and upserts each product", async () => {
    const products = [{ title: "Trail Runner", description: "desc" }]
    const medusaClient = { fetchProductId: jest.fn().mockResolvedValue("prod_1") }
    const embedder = { embedBatch: jest.fn().mockResolvedValue([[0.1, 0.2]]) }
    const supabaseUpserter = { upsertEmbedding: jest.fn().mockResolvedValue(undefined) }

    const stats = await runIngestion(products, { dryRun: false, medusaClient, embedder, supabaseUpserter })

    expect(stats).toEqual({ ok: 1, failed: 0 })
    expect(supabaseUpserter.upsertEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ medusa_product_id: "prod_1", embedding: [0.1, 0.2] })
    )
  })

  it("counts products with no matching Medusa id as failed and skips upserting them", async () => {
    const products = [{ title: "Unknown Product", description: "desc" }]
    const medusaClient = { fetchProductId: jest.fn().mockResolvedValue(null) }
    const embedder = { embedBatch: jest.fn().mockResolvedValue([[0.1, 0.2]]) }
    const supabaseUpserter = { upsertEmbedding: jest.fn() }

    const stats = await runIngestion(products, { dryRun: false, medusaClient, embedder, supabaseUpserter })

    expect(stats).toEqual({ ok: 0, failed: 1 })
    expect(supabaseUpserter.upsertEmbedding).not.toHaveBeenCalled()
  })

  it("counts upsert failures as failed without throwing", async () => {
    const products = [{ medusa_product_id: "prod_1", title: "Trail Runner", description: "desc" }]
    const medusaClient = { fetchProductId: jest.fn() }
    const embedder = { embedBatch: jest.fn().mockResolvedValue([[0.1, 0.2]]) }
    const supabaseUpserter = { upsertEmbedding: jest.fn().mockRejectedValue(new Error("boom")) }

    const stats = await runIngestion(products, { dryRun: false, medusaClient, embedder, supabaseUpserter })

    expect(stats).toEqual({ ok: 0, failed: 1 })
  })
})
