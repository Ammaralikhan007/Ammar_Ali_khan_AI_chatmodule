export type UserRole = "user" | "admin";

/**
 * Domain entity for an application user. Identity is external (OIDC): we never
 * store passwords — `externalAuthId` maps to the IdP subject (`sub`). Exposes
 * the role checks `isAdmin` / `isNormalUser`.
 */
export class User {
  constructor(
    public readonly id: string,
    public readonly externalAuthId: string,
    public readonly email: string,
    public readonly role: UserRole,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  isAdmin(): boolean {
    return this.role === "admin";
  }

  isNormalUser(): boolean {
    return this.role === "user";
  }
}
