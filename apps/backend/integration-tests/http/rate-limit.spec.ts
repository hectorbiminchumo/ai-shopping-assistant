import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createRateLimit } from "../../src/api/rate-limit"

function buildReq(overrides: Partial<MedusaRequest> = {}): MedusaRequest {
  return {
    headers: {},
    socket: { remoteAddress: "10.0.0.1" },
    ...overrides,
  } as Partial<MedusaRequest> as MedusaRequest
}

function buildRes(): MedusaResponse & {
  status: jest.Mock
  json: jest.Mock
  setHeader: jest.Mock
} {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  }
  return res as Partial<MedusaResponse> as MedusaResponse & {
    status: jest.Mock
    json: jest.Mock
    setHeader: jest.Mock
  }
}

// A request from a given IP, plus a fresh next() spy for it.
function fire(
  limiter: (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => void,
  ip = "1.2.3.4"
) {
  const req = buildReq({ headers: { "x-forwarded-for": ip } } as Partial<MedusaRequest>)
  const res = buildRes()
  const next = jest.fn() as unknown as MedusaNextFunction
  limiter(req, res, next)
  return { res, next: next as unknown as jest.Mock }
}

describe("createRateLimit", () => {
  it("allows requests up to the limit, then blocks with 429", () => {
    const limiter = createRateLimit({ windowMs: 1000, max: 3, now: () => 0 })

    for (let i = 0; i < 3; i++) {
      const { next, res } = fire(limiter)
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    }

    const { next, res } = fire(limiter)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/too many requests/i) })
    )
  })

  it("sets a Retry-After header on the 429", () => {
    let clock = 0
    const limiter = createRateLimit({ windowMs: 10_000, max: 1, now: () => clock })

    fire(limiter) // consumes the single allowed request
    clock = 4000 // 6s left in the window
    const { res } = fire(limiter)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "6")
  })

  it("resets the allowance once the window elapses", () => {
    let clock = 0
    const limiter = createRateLimit({ windowMs: 1000, max: 1, now: () => clock })

    expect(fire(limiter).next).toHaveBeenCalled() // 1st: allowed
    expect(fire(limiter).next).not.toHaveBeenCalled() // 2nd: blocked

    clock = 1000 // window boundary reached
    expect(fire(limiter).next).toHaveBeenCalled() // allowed again
  })

  it("tracks each client IP independently", () => {
    const limiter = createRateLimit({ windowMs: 1000, max: 1, now: () => 0 })

    expect(fire(limiter, "1.1.1.1").next).toHaveBeenCalled()
    // Second IP is unaffected by the first exhausting its budget
    expect(fire(limiter, "2.2.2.2").next).toHaveBeenCalled()
    // First IP is now over its limit
    expect(fire(limiter, "1.1.1.1").next).not.toHaveBeenCalled()
  })

  it("keys on the left-most X-Forwarded-For hop (the real client behind a proxy)", () => {
    const limiter = createRateLimit({ windowMs: 1000, max: 1, now: () => 0 })

    // Same client, arriving with an appended proxy hop — must share one bucket
    fire(limiter, "9.9.9.9")
    const req = buildReq({
      headers: { "x-forwarded-for": "9.9.9.9, 70.0.0.1" },
    } as Partial<MedusaRequest>)
    const res = buildRes()
    const next = jest.fn() as unknown as MedusaNextFunction
    limiter(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(429)
  })

  it("falls back to the socket address when there is no X-Forwarded-For", () => {
    const limiter = createRateLimit({ windowMs: 1000, max: 1, now: () => 0 })
    const call = () => {
      const req = buildReq({ socket: { remoteAddress: "10.0.0.9" } } as Partial<MedusaRequest>)
      const res = buildRes()
      const next = jest.fn() as unknown as MedusaNextFunction
      limiter(req, res, next)
      return { res, next: next as unknown as jest.Mock }
    }

    expect(call().next).toHaveBeenCalled()
    expect(call().next).not.toHaveBeenCalled() // same socket IP, over limit
  })

  it("evicts expired buckets so distinct IPs don't grow memory without bound", () => {
    let clock = 0
    const limiter = createRateLimit({ windowMs: 1000, max: 1, now: () => clock })

    // Two IPs use their budget in window 1
    fire(limiter, "1.1.1.1")
    fire(limiter, "2.2.2.2")

    // Advance past the window; the next request triggers a sweep that drops the
    // two now-expired buckets, and 1.1.1.1 gets a fresh allowance.
    clock = 1500
    expect(fire(limiter, "1.1.1.1").next).toHaveBeenCalled()
  })
})
