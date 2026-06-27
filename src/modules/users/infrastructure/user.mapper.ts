import { User } from "../domain/user.entity";
import { UserOrmEntity } from "./user.orm-entity";

/**
 * Maps between the `UserOrmEntity` (DB row) and the `User` domain entity.
 */
export class UserMapper {
  static toDomain(orm: UserOrmEntity): User {
    return new User(
      orm.id,
      orm.externalAuthId,
      orm.email,
      orm.role,
      orm.createdAt,
      orm.updatedAt
    );
  }

  static toOrm(domain: User): UserOrmEntity {
    const orm = new UserOrmEntity();

    orm.id = domain.id;
    orm.externalAuthId = domain.externalAuthId;
    orm.email = domain.email;
    orm.role = domain.role;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;

    return orm;
  }
}
