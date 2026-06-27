/**
 * Domain entity: one question/answer exchange. Immutable record of what was
 * asked, the (mock) AI's answer, token usage, and free-form metadata. Pure
 * domain type — no framework or persistence concerns.
 */
export class ChatMessage {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly question: string,
    public readonly answer: string,
    public readonly promptTokens: number,
    public readonly completionTokens: number,
    public readonly totalTokens: number,
    public readonly metadata: Record<string, unknown>,
    public readonly createdAt: Date
  ) {}
}
