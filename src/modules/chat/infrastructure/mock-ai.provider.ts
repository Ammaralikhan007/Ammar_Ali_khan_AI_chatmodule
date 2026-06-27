export type MockAiResponse = {
  answer: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

/**
 * Stand-in for a real AI provider (e.g. the Claude API). Simulates network
 * latency and returns a canned answer plus estimated token counts, so the chat
 * flow — quota, persistence, ledger — can be built and tested without external
 * calls. Swap this for a real client behind the same `ask()` shape.
 */
export class MockAiProvider {
  async ask(question: string): Promise<MockAiResponse> {
    await this.simulateLatency();

    const promptTokens = this.estimateTokens(question);
    const answer = `Mocked AI response for: ${question}`;
    const completionTokens = this.estimateTokens(answer);

    return {
      answer,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private async simulateLatency(): Promise<void> {
    const delayMs = 500 + Math.floor(Math.random() * 500);

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
