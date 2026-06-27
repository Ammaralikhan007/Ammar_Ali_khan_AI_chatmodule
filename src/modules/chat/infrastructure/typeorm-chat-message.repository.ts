import { EntityManager, Repository } from "typeorm";
import { AppDataSource } from "../../../shared/persistence/data-source";
import { ChatMessage } from "../domain/chat-message.entity";
import { ChatMessageRepository } from "../domain/chat-message.repository";
import { ChatMessageMapper } from "./chat-message.mapper";
import { ChatMessageOrmEntity } from "./chat-message.orm-entity";

export class TypeOrmChatMessageRepository implements ChatMessageRepository {
  private readonly repo: Repository<ChatMessageOrmEntity>;

  constructor() {
    this.repo = AppDataSource.getRepository(ChatMessageOrmEntity);
  }

  async create(params: {
    userId: string;
    question: string;
    answer: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    metadata: Record<string, unknown>;
    manager?: EntityManager;
  }): Promise<ChatMessage> {
    const repo = params.manager
      ? params.manager.getRepository(ChatMessageOrmEntity)
      : this.repo;

    const chatMessage = repo.create({
      userId: params.userId,
      question: params.question,
      answer: params.answer,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.totalTokens,
      metadata: params.metadata,
    });

    const savedChatMessage = await repo.save(chatMessage);

    return ChatMessageMapper.toDomain(savedChatMessage);
  }

  async findByUserId(userId: string): Promise<ChatMessage[]> {
    const chatMessages = await this.repo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });

    return chatMessages.map(ChatMessageMapper.toDomain);
  }
}
