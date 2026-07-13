import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

jest.mock("@dtc/chatbot-core", () =>
  require("../mocks/chatbot-core.mock").mockChatbotCore()
)

import { POST } from "../../src/api/search/semantic/route"
import { SearchOrchestrator, RetrievalError } from "@dtc/chatbot-core"

const MockedSearchOrchestrator = SearchOrchestrator as unknown as jest.Mock

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

describe("POST /search/semantic", () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it("returns 200 with the orchestrator's search results on a valid request", async () => {
    const mockSearch = jest.fn().mockResolvedValue({
      products: [
        {
          id: "prod_1",
          medusaProductId: "medusa_prod_1",
          title: "Trail Runner",
          similarityScore: 0.87,
        },
      ],
      hasResults: true,
    })
    MockedSearchOrchestrator.mockImplementation(() => ({ search: mockSearch }))

    const req = buildReq({ query: "running shoes" })
    const res = buildRes()

    await POST(req, res)

    expect(mockSearch).toHaveBeenCalledWith("running shoes")
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hasResults: true }))
  })

  it("returns 400 when the request body is invalid", async () => {
    const req = buildReq({})
    const res = buildRes()

    await POST(req, res)

    expect(MockedSearchOrchestrator).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Invalid request body",
        errors: expect.arrayContaining([expect.any(String)]),
      })
    )
  })

  it("returns 502 when retrieval fails", async () => {
    const mockSearch = jest.fn().mockRejectedValue(new RetrievalError("Vector search failed"))
    MockedSearchOrchestrator.mockImplementation(() => ({ search: mockSearch }))

    const req = buildReq({ query: "running shoes" })
    const res = buildRes()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({ message: "Vector search failed" })
  })
})
