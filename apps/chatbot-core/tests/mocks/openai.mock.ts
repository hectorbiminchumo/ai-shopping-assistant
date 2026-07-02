import type { ILLMService } from "../../src/interfaces"

export function createMockLLMService(reply = "Here are some great options for you."): ILLMService {
  return {
    generateResponse: jest.fn().mockResolvedValue(reply),
    complete: jest.fn().mockResolvedValue(reply),
    stream: jest.fn().mockImplementation(async function* () {
      yield reply
    }),
  }
}
