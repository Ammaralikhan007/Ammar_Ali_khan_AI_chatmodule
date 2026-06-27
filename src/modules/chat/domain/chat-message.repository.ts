import { EntityManager } from "typeorm";
import { ChatMessage } from "./chat-message.entity";

/**
 * Repository PORT for chat messages (implemented by infrastructure/TypeORM).
 * `create` accepts an optional `EntityManager` so it can participate in the
 * AskQuestionUseCase's transaction.
 */
export interface ChatMessageRepository {
  create(params: {
    userId: string;
    question: string;
    answer: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    metadata: Record<string, unknown>;
    manager?: EntityManager;
  }): Promise<ChatMessage>;

  findByUserId(userId: string): Promise<ChatMessage[]>;
}
