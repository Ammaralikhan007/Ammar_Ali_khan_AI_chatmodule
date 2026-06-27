import crypto from "crypto";
import {
  ChargeRequest,
  ChargeResult,
  PaymentGateway,
} from "../domain/payment-gateway";

/**
 * A simulated payment gateway for local/dev use.
 *
 * It models the two things that make real billing interesting:
 *  - latency  — charges aren't instant (network round-trip simulated).
 *  - failure  — cards get declined. A configurable fraction of charges fail at
 *               random, which is what exercises the renewal use-case's failure
 *               path (subscription deactivated, usage history preserved).
 *
 * The failure rate is read from `BILLING_PAYMENT_FAILURE_RATE` (0..1, default
 * 0.2). Set it to 0 for deterministic "always succeeds" manual testing, or 1
 * to always exercise the decline path.
 */
export class MockPaymentGateway implements PaymentGateway {
  private readonly failureRate: number;

  constructor() {
    const configured = Number(process.env.BILLING_PAYMENT_FAILURE_RATE);
    this.failureRate =
      Number.isFinite(configured) && configured >= 0 && configured <= 1
        ? configured
        : 0.2;
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    await this.simulateLatency();

    // Basic sanity check on the charge amount.
    if (request.amountCents <= 0) {
      return {
        success: false,
        failureReason: "Invalid charge amount",
      };
    }

    if (Math.random() < this.failureRate) {
      return {
        success: false,
        failureReason: "Payment declined by issuer (simulated)",
      };
    }

    return {
      success: true,
      transactionId: `mock_txn_${crypto.randomUUID()}`,
    };
  }

  private async simulateLatency(): Promise<void> {
    const delayMs = 100 + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
