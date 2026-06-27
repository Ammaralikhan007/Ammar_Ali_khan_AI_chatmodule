import { User } from "./user.entity";

/**
 * Repository PORT for users (implemented by infrastructure/TypeORM). Lookup by
 * id or external auth id, plus just-in-time `create` used on first login.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;

  findByExternalAuthId(externalAuthId: string): Promise<User | null>;

  create(params: {
    externalAuthId: string;
    email: string;
    role: "user" | "admin";
  }): Promise<User>;
}
