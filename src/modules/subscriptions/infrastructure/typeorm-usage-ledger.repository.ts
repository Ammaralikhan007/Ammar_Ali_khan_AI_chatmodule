import { EntityManager, Repository } from "typeorm";
import { AppDataSource } from "../../../shared/persistence/data-source";
import { UsageLedgerOrmEntity } from "./usage-ledger.orm-entity";

/**
 * Writes rows to the append-only usage ledger. `create` accepts an optional
 * `EntityManager` so the ledger insert commits atomically with the chat
 * message inside the AskQuestionUseCase transaction.
 */
export class TypeOrmUsageLedgerRepository {
  private readonly repo: Repository<UsageLedgerOrmEntity>;

  constructor() {
    this.repo = AppDataSource.getRepository(UsageLedgerOrmEntity);
  }

  async create(params: {
    userId: string;
    subscriptionId: string | null;
    chatMessageId: string | null;
    source: "free" | "subscription";
    amount: number;
    manager?: EntityManager;
  }): Promise<UsageLedgerOrmEntity> {
    const repo = params.manager
      ? params.manager.getRepository(UsageLedgerOrmEntity)
      : this.repo;

    const usage = repo.create({
      userId: params.userId,
      subscriptionId: params.subscriptionId,
      chatMessageId: params.chatMessageId,
      source: params.source,
      amount: params.amount,
    });

    return repo.save(usage);
  }
}
