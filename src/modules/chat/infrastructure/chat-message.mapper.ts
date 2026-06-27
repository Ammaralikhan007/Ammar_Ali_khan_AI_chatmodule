import { ChatMessage } from "../domain/chat-message.entity";
import { ChatMessageOrmEntity } from "./chat-message.orm-entity";

/**
 * Translates between the `ChatMessageOrmEntity` (DB row) and the `ChatMessage`
 * domain entity. Keeping mapping in one place is what lets the domain stay free
 * of persistence concerns.
 */
export class ChatMessageMapper {
  static toDomain(orm: ChatMessageOrmEntity): ChatMessage {
    return new ChatMessage(
      orm.id,
      orm.userId,
      orm.question,
      orm.answer,
      orm.promptTokens,
      orm.completionTokens,
      orm.totalTokens,
      orm.metadata,
      orm.createdAt
    );
  }
}
