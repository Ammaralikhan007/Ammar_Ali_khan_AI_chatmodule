import { Repository } from "typeorm";
import { AppDataSource } from "../../../shared/persistence/data-source";
import { User } from "../domain/user.entity";
import { UserRepository } from "../domain/user.repository";
import { UserMapper } from "./user.mapper";
import { UserOrmEntity } from "./user.orm-entity";

/**
 * TypeORM implementation of the UserRepository port — the only place that talks
 * to the `users` table, mapping rows to/from the `User` domain entity.
 */
export class TypeOrmUserRepository implements UserRepository {
  private readonly repo: Repository<UserOrmEntity>;

  constructor() {
    this.repo = AppDataSource.getRepository(UserOrmEntity);
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.repo.findOne({
      where: { id },
    });

    return user ? UserMapper.toDomain(user) : null;
  }

  async findByExternalAuthId(externalAuthId: string): Promise<User | null> {
    const user = await this.repo.findOne({
      where: { externalAuthId },
    });

    return user ? UserMapper.toDomain(user) : null;
  }

  async create(params: {
    externalAuthId: string;
    email: string;
    role: "user" | "admin";
  }): Promise<User> {
    const user = this.repo.create({
      externalAuthId: params.externalAuthId,
      email: params.email,
      role: params.role,
    });

    const savedUser = await this.repo.save(user);

    return UserMapper.toDomain(savedUser);
  }
}
