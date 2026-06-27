import { AppDataSource } from "../../../shared/persistence/data-source";
import { ChatMessageRepository } from "../domain/chat-message.repository";
import { MockAiProvider } from "../infrastructure/mock-ai.provider";
import { QuotaService } from "./quota.service";
import { TypeOrmUsageLedgerRepository } from "../../subscriptions/infrastructure/typeorm-usage-ledger.repository";

/**
 * MODULE 1 core use-case: answer a question while safely deducting quota.
 *
 * Everything runs inside a single DB transaction so the four steps — deduct
 * quota, call the AI, persist the chat message, append the usage-ledger row —
 * either all commit or all roll back. That atomicity is what guarantees quota
 * is never charged without a stored answer, and never double-spent.
 */
export class AskQuestionUseCase {
  constructor(
    private readonly chatMessageRepository: ChatMessageRepository,
    private readonly aiProvider: MockAiProvider,
    private readonly quotaService: QuotaService,
    private readonly usageLedgerRepository: TypeOrmUsageLedgerRepository
  ) {}

  async execute(params: {
    userId: string;
    question: string;
    metadata: Record<string, unknown>;
  }) {
    return AppDataSource.transaction(async (manager) => {
      const quotaResult = await this.quotaService.deductQuota({
        userId: params.userId,
        manager,
      });

      const aiResponse = await this.aiProvider.ask(params.question);

      const chatMessage = await this.chatMessageRepository.create({
        userId: params.userId,
        question: params.question,
        answer: aiResponse.answer,
        promptTokens: aiResponse.promptTokens,
        completionTokens: aiResponse.completionTokens,
        totalTokens: aiResponse.totalTokens,
        metadata: {
          ...params.metadata,
          quota: quotaResult,
        },
        manager,
      });

      await this.usageLedgerRepository.create({
        userId: params.userId,
        subscriptionId:
          quotaResult.source === "subscription"
            ? quotaResult.subscriptionId
            : null,
        chatMessageId: chatMessage.id,
        source: quotaResult.source,
        amount: 1,
        manager,
      });

      return chatMessage;
    });
  }
}
