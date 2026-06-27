/**
 * Payment gateway PORT (domain interface).
 *
 * The domain/application layers depend only on this abstraction, never on a
 * concrete payment provider. Infrastructure supplies an implementation (here a
 * mock; in production a Stripe/Braintree adapter) — this is what keeps billing
 * logic framework- and vendor-agnostic per Clean Architecture.
 */

export interface ChargeRequest {
  /** Amount to charge in the smallest currency unit (cents). */
  amountCents: number;
  /** The subscription this charge is for (used as an idempotency hint / audit). */
  subscriptionId: string;
  /** A human-readable description for the (mock) statement. */
  description: string;
}

export interface ChargeResult {
  success: boolean;
  /** Present on success — the gateway's transaction reference. */
  transactionId?: string;
  /** Present on failure — why the charge was declined. */
  failureReason?: string;
}

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
