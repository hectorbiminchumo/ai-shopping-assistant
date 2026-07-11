// Shared `jest.mock("@dtc/chatbot-core", ...)` factory for the HTTP route
// specs under `integration-tests/http/`.
//
// Keeps the real error classes (ChatbotError and its subclasses) so that
// `err instanceof ChatbotError` checks in the route handlers still behave
// correctly when a mocked orchestrator's `.handle`/`.search` rejects with
// one of them. Every other export — the pipeline/orchestrator classes the
// routes `new` up — becomes a trivial `jest.fn()` constructor, since the
// real implementations reach out to Supabase/Voyage/OpenAI, and
// `LLMService`'s real constructor calls `getOpenAiClient()` eagerly, which
// throws immediately if `OPENAI_API_KEY` isn't set (it isn't, in CI).
//
// IMPORTANT: invoke this from *inside* the `jest.mock()` factory via
// `require(...)`:
//
//   jest.mock("@dtc/chatbot-core", () =>
//     require("../mocks/chatbot-core.mock").mockChatbotCore()
//   )
//
// rather than importing `mockChatbotCore` at the top of the spec file and
// referencing it from the factory. ts-jest hoists `jest.mock()` calls above
// every other top-level statement in the file, but — unlike babel-jest's
// babel-plugin-jest-hoist — it does not also hoist `mock`-prefixed variable
// declarations alongside the call, nor does it warn about out-of-scope
// references. Requiring the helper from inside the factory body sidesteps
// that entirely, the same way `jest.requireActual` does below.
export function mockChatbotCore() {
  const actual = jest.requireActual("@dtc/chatbot-core")

  return {
    ...actual,
    QueryParser: jest.fn(),
    EmbeddingService: jest.fn(),
    RetrievalService: jest.fn(),
    Reranker: jest.fn(),
    PromptAssembler: jest.fn(),
    LLMService: jest.fn(),
    ResponseFormatter: jest.fn(),
    ChatOrchestrator: jest.fn(),
    SearchOrchestrator: jest.fn(),
  }
}
