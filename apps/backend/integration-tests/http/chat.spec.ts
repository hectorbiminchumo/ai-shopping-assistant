import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// See ../mocks/chatbot-core.mock.ts for why this is required lazily from
// *inside* the factory instead of imported at the top of this file.
jest.mock("@dtc/chatbot-core", () =>
  require("../mocks/chatbot-core.mock").mockChatbotCore()
)

import { POST } from "../../src/api/search/chat/route"
import { ChatOrchestrator, ChatbotError, RetrievalService } from "@dtc/chatbot-core"

// `ChatOrchestrator`/`RetrievalService` are the jest.fn() constructors
// installed by the mock factory above. Casting through `jest.Mock` (rather
// than `jest.mocked()`) avoids fighting the real classes' private-field
// instance type when configuring `mockImplementation` below.
const MockedChatOrchestrator = ChatOrchestrator as unknown as jest.Mock
const MockedRetrievalService = RetrievalService as unknown as jest.Mock

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

describe("POST /search/chat", () => {
  afterEach(() => {
    // Clears .mock.calls (needed for the `not.toHaveBeenCalled()`
    // assertions below) as well as any leftover mockImplementation.
    jest.clearAllMocks()
  })

  it("returns 200 with the orchestrator's response on a valid request", async () => {
    const mockHandle = jest.fn().mockResolvedValue({
      message: "Here are a few running shoes you might like.",
      products: [
        {
          id: "prod_1",
          medusaProductId: "medusa_prod_1",
          title: "Trail Runner",
          similarityScore: 0.87,
        },
      ],
      hasResults: true,
      history: [
        { role: "user", content: "running shoes" },
        { role: "assistant", content: "Here are a few running shoes you might like." },
      ],
    })
    MockedChatOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

    const req = buildReq({ query: "running shoes", sessionId: "session-1" })
    const res = buildRes()

    await POST(req, res)

    expect(mockHandle).toHaveBeenCalledWith(
      "running shoes",
      { sessionId: "session-1", history: [] },
      undefined
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Here are a few running shoes you might like.",
        hasResults: true,
      })
    )
  })

  it("returns 400 when query is missing", async () => {
    const req = buildReq({ sessionId: "session-1" })
    const res = buildRes()

    await POST(req, res)

    expect(MockedChatOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Invalid request body",
        errors: expect.arrayContaining([expect.any(String)]),
      })
    )
  })

  it("returns 400 when query is empty", async () => {
    const req = buildReq({ query: "   ", sessionId: "session-1" })
    const res = buildRes()

    await POST(req, res)

    expect(MockedChatOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 400 when sessionId is missing", async () => {
    const req = buildReq({ query: "running shoes" })
    const res = buildRes()

    await POST(req, res)

    expect(MockedChatOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid request body" })
    )
  })

  it("returns 502 with the ChatbotError message when the orchestrator throws", async () => {
    const mockHandle = jest
      .fn()
      .mockRejectedValue(new ChatbotError("LLM is temporarily unavailable"))
    MockedChatOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

    const req = buildReq({ query: "running shoes", sessionId: "session-1" })
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({ message: "LLM is temporarily unavailable" })
  })

  describe("explicit filters", () => {
    it("forwards valid filters to the orchestrator as the third argument", async () => {
      const mockHandle = jest.fn().mockResolvedValue({
        message: "Here are a few running shoes you might like.",
        products: [],
        hasResults: true,
        history: [],
        appliedFilters: { category: "running-shoes", priceMax: 100 },
      })
      MockedChatOrchestrator.mockImplementation(() => ({ handle: mockHandle }))
      MockedRetrievalService.mockImplementation(() => ({
        listCategories: jest.fn().mockResolvedValue(["running-shoes", "jackets"]),
      }))

      const req = buildReq({
        query: "running shoes",
        sessionId: "session-1",
        filters: { category: "running-shoes", priceMax: 100 },
      })
      const res = buildRes()

      await POST(req, res)

      expect(mockHandle).toHaveBeenCalledWith(
        "running shoes",
        { sessionId: "session-1", history: [] },
        { category: "running-shoes", priceMax: 100 }
      )
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          appliedFilters: { category: "running-shoes", priceMax: 100 },
        })
      )
    })

    it("returns 400 when filters.priceMin is negative", async () => {
      const req = buildReq({
        query: "running shoes",
        sessionId: "session-1",
        filters: { priceMin: -10 },
      })
      const res = buildRes()

      await POST(req, res)

      expect(MockedChatOrchestrator).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 400 when filters.priceMax is negative", async () => {
      const req = buildReq({
        query: "running shoes",
        sessionId: "session-1",
        filters: { priceMax: -50 },
      })
      const res = buildRes()

      await POST(req, res)

      expect(MockedChatOrchestrator).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 400 when a filter price is not a number", async () => {
      const req = buildReq({
        query: "running shoes",
        sessionId: "session-1",
        filters: { priceMax: "expensive" },
      })
      const res = buildRes()

      await POST(req, res)

      expect(MockedChatOrchestrator).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 400 when priceMin is greater than priceMax", async () => {
      const req = buildReq({
        query: "running shoes",
        sessionId: "session-1",
        filters: { priceMin: 100, priceMax: 50 },
      })
      const res = buildRes()

      await POST(req, res)

      expect(MockedChatOrchestrator).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 400 when filters.category is not a known catalog category", async () => {
      MockedRetrievalService.mockImplementation(() => ({
        listCategories: jest.fn().mockResolvedValue(["running-shoes", "jackets"]),
      }))

      const req = buildReq({
        query: "running shoes",
        sessionId: "session-1",
        filters: { category: "swimwear" },
      })
      const res = buildRes()

      await POST(req, res)

      expect(MockedChatOrchestrator).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([expect.stringContaining("swimwear")]),
        })
      )
    })

    it.each([
      ["empty", ""],
      ["whitespace-only", "   "],
      ["containing invalid characters", "<42>"],
    ])("returns 400 when filters.size is %s", async (_label, size) => {
      const req = buildReq({
        query: "running shoes",
        sessionId: "session-1",
        filters: { size },
      })
      const res = buildRes()

      await POST(req, res)

      expect(MockedChatOrchestrator).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe("history request window", () => {
    it("accepts an explicit empty history array", async () => {
      const mockHandle = jest.fn().mockResolvedValue({
        message: "Hi",
        products: [],
        hasResults: true,
        history: [],
      })
      MockedChatOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

      const req = buildReq({ query: "running shoes", sessionId: "session-1", history: [] })
      const res = buildRes()

      await POST(req, res)

      expect(mockHandle).toHaveBeenCalledWith(
        "running shoes",
        { sessionId: "session-1", history: [] },
        undefined
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it("forwards a non-empty history array unchanged", async () => {
      const mockHandle = jest.fn().mockResolvedValue({
        message: "Hi",
        products: [],
        hasResults: true,
        history: [],
      })
      MockedChatOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

      const history = [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "more shoes please" },
      ]
      const req = buildReq({ query: "running shoes", sessionId: "session-1", history })
      const res = buildRes()

      await POST(req, res)

      expect(mockHandle).toHaveBeenCalledWith(
        "running shoes",
        { sessionId: "session-1", history },
        undefined
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it("accepts a history array at the 20-item limit", async () => {
      const mockHandle = jest.fn().mockResolvedValue({
        message: "Hi",
        products: [],
        hasResults: true,
        history: [],
      })
      MockedChatOrchestrator.mockImplementation(() => ({ handle: mockHandle }))

      const history = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `turn ${i + 1}`,
      }))
      const req = buildReq({ query: "running shoes", sessionId: "session-1", history })
      const res = buildRes()

      await POST(req, res)

      expect(mockHandle).toHaveBeenCalledWith(
        "running shoes",
        { sessionId: "session-1", history },
        undefined
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it("returns 400 when history exceeds the 20-item limit", async () => {
      const history = Array.from({ length: 21 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `turn ${i + 1}`,
      }))
      const req = buildReq({ query: "running shoes", sessionId: "session-1", history })
      const res = buildRes()

      await POST(req, res)

      expect(MockedChatOrchestrator).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
