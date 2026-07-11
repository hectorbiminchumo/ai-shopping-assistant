import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// See ../mocks/chatbot-core.mock.ts for why this is required lazily from
// *inside* the factory instead of imported at the top of this file.
jest.mock("@dtc/chatbot-core", () =>
  require("../mocks/chatbot-core.mock").mockChatbotCore()
)

import { POST } from "../../src/api/search/chat/route"
import { ChatOrchestrator, ChatbotError } from "@dtc/chatbot-core"

// `ChatOrchestrator` is the jest.fn() constructor installed by the mock
// factory above. Casting through `jest.Mock` (rather than `jest.mocked()`)
// avoids fighting the real class's private-field instance type when
// configuring `mockImplementation` below.
const MockedChatOrchestrator = ChatOrchestrator as unknown as jest.Mock

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

    expect(mockHandle).toHaveBeenCalledWith("running shoes", {
      sessionId: "session-1",
      history: [],
    })
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

  // BLOCKED: "explicit filters" are not yet implemented on POST /search/chat.
  // There is currently no request-body field for filters, and neither
  // `ChatOrchestrator.handle` nor `QueryParser.parse` accepts a structured
  // filters param in src/ (only free-text regex-based extraction of
  // category/priceMax/size/audience from the raw query). Once the feature
  // lands end-to-end, add cases here for:
  //   - filters parsed from the request body and forwarded to/returned by
  //     the orchestrator
  //   - invalid filter values rejected with 400
  it.todo("explicit filters (blocked — see comment above)")
})
