import { EntityManager, Repository } from "typeorm";
import { AppDataSource } from "../../../shared/persistence/data-source";
import { MonthlyFreeUsageOrmEntity } from "./monthly-free-usage.orm-entity";

/**
 * Helper repository for the monthly free-usage counter (find-or-create for the
 * current month). NOTE: the hot path in `QuotaService` does its own locked
 * read/increment inside the transaction; this exists for non-transactional
 * lookups and keeps the counter-creation logic in one place.
 */
export class TypeOrmMonthlyFreeUsageRepository {
  private readonly repo: Repository<MonthlyFreeUsageOrmEntity>;

  constructor() {
    this.repo = AppDataSource.getRepository(MonthlyFreeUsageOrmEntity);
  }

  async findOrCreateForCurrentMonth(params: {
    userId: string;
    usageMonth: string;
    manager?: EntityManager;
  }): Promise<MonthlyFreeUsageOrmEntity> {
    const repo = params.manager
      ? params.manager.getRepository(MonthlyFreeUsageOrmEntity)
      : this.repo;

    let usage = await repo.findOne({
      where: {
        userId: params.userId,
        usageMonth: params.usageMonth,
      },
    });

    if (!usage) {
      usage = repo.create({
        userId: params.userId,
        usageMonth: params.usageMonth,
        usedMessages: 0,
        freeLimit: 3,
      });

      usage = await repo.save(usage);
    }

    return usage;
  }
}
