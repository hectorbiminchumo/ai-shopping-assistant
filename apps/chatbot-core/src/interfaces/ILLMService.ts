export interface ILLMService {
  complete(prompt: string): Promise<string>
  stream(prompt: string): AsyncIterable<string>
}
