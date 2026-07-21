import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// See ../mocks/chatbot-core.mock.ts for why this is required lazily from
// *inside* the factory instead of imported at the top of this file.
jest.mock("@dtc/chatbot-core", () =>
  require("../mocks/chatbot-core.mock").mockChatbotCore()
)

import { POST } from "../../src/api/store/search/visual/route"
import { ChatbotError, VisualSearchOrchestrator } from "@dtc/chatbot-core"

const MockedVisualSearchOrchestrator = VisualSearchOrchestrator as unknown as jest.Mock

function buildReq(body: unknown): MedusaRequest {
  return { body } as Partial<MedusaRequest> as MedusaRequest
}

function buildRes(): MedusaResponse & { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
  return res as Partial<MedusaResponse> as MedusaResponse & {
    status: jest.Mock
    json: jest.Mock
  }
}

function mockSearch(impl: jest.Mock) {
  MockedVisualSearchOrchestrator.mockImplementation(() => ({ search: impl }))
  return impl
}

const similarProducts = {
  products: [
    {
      id: "uuid_2",
      medusaProductId: "prod_2",
      title: "Trail Runner X",
      thumbnailUrl: "https://example.com/2.png",
      priceMin: 95,
      priceMax: 95,
      similarityScore: 0.83,
    },
  ],
  hasResults: true,
}

describe("POST /store/search/visual", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it("returns 200 with visually similar products for a known product", async () => {
    const search = mockSearch(jest.fn().mockResolvedValue(similarProducts))
    const res = buildRes()

    await POST(buildReq({ productId: "prod_1" }), res)

    expect(search).toHaveBeenCalledWith("prod_1", undefined)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(similarProducts)
  })

  it("passes an explicit topK through to the orchestrator", async () => {
    const search = mockSearch(jest.fn().mockResolvedValue(similarProducts))

    await POST(buildReq({ productId: "prod_1", topK: 3 }), buildRes())

    expect(search).toHaveBeenCalledWith("prod_1", 3)
  })

  // "Nothing looks like it" is a successful search, distinct from the 404 below
  it("returns 200 with hasResults false when nothing clears the threshold", async () => {
    mockSearch(jest.fn().mockResolvedValue({ products: [], hasResults: false }))
    const res = buildRes()

    await POST(buildReq({ productId: "prod_1" }), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ products: [], hasResults: false })
  })

  // null from the orchestrator = unknown product, or one never image-indexed
  it("returns 404 when the product has no indexed image", async () => {
    mockSearch(jest.fn().mockResolvedValue(null))
    const res = buildRes()

    await POST(buildReq({ productId: "prod_missing" }), res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ message: "Product has no indexed image" })
  })

  it.each([
    ["a missing productId", {}, "productId is required and must be a string"],
    ["an empty productId", { productId: "   " }, "productId must not be empty"],
    ["a non-integer topK", { productId: "prod_1", topK: 2.5 }, "topK must be an integer"],
    ["a topK above the cap", { productId: "prod_1", topK: 21 }, "topK must be at most 20"],
    ["a topK below 1", { productId: "prod_1", topK: 0 }, "topK must be at least 1"],
  ])("returns 400 for %s", async (_label, body, expectedError) => {
    const search = mockSearch(jest.fn())
    const res = buildRes()

    await POST(buildReq(body), res)

    expect(res.status).toHaveBeenCalledWith(400)
    // The message must name the offending field — zod's default for a missing
    // key doesn't, and this body is all the API consumer gets.
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid request body",
      errors: [expectedError],
    })
    expect(search).not.toHaveBeenCalled()
  })

  it("surfaces a ChatbotError's message with a 500", async () => {
    mockSearch(jest.fn().mockRejectedValue(new ChatbotError("Image vector search failed")))
    const res = buildRes()

    await POST(buildReq({ productId: "prod_1" }), res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: "Image vector search failed" })
  })

  // An unexpected error must not leak its internals to the client
  it("returns a generic message for a non-ChatbotError failure", async () => {
    mockSearch(jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432")))
    const res = buildRes()

    await POST(buildReq({ productId: "prod_1" }), res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: "Visual search failed" })
  })
})
