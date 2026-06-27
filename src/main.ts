import "reflect-metadata";
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";

// --- shared: security / observability / errors -----------------------------
import { requireJsonContentType } from "./shared/security/content-type.middleware";
import { requestIdMiddleware } from "./shared/observability/request-id.middleware";
import { requestLoggerMiddleware } from "./shared/observability/request-logger.middleware";
import { errorHandlerMiddleware } from "./shared/errors/error-handler.middleware";
import {
  createRequestTimeout,
  REQUEST_TIMEOUT_MS,
} from "./shared/security/request-timeout.middleware";
import {
  ipRateLimiter,
  defaultUserRateLimiter,
  chatRateLimiter,
  subscriptionRateLimiter,
  adminRateLimiter,
} from "./shared/security/rate-limit/rate-limiters";
import { validateBody } from "./shared/validation/validate-body.middleware";

// --- shared: auth ----------------------------------------------------------
import { protectedRoute } from "./shared/auth/protected-route";
import { requireRole } from "./shared/auth/require-role.middleware";
import { mockOidcProvider } from "./shared/auth/oidc/mock-oidc.provider";

// --- persistence -----------------------------------------------------------
import { AppDataSource } from "./shared/persistence/data-source";
import { UsageLedgerOrmEntity } from "./modules/subscriptions/infrastructure/usage-ledger.orm-entity";

// --- subscriptions module --------------------------------------------------
import { createSubscriptionSchema } from "./modules/subscriptions/interface/create-subscription.schema";
import { TypeOrmSubscriptionRepository } from "./modules/subscriptions/infrastructure/typeorm-subscription.repository";
import { CreateSubscriptionUseCase } from "./modules/subscriptions/application/create-subscription.usecase";
import { CancelSubscriptionUseCase } from "./modules/subscriptions/application/cancel-subscription.usecase";

// --- chat module -----------------------------------------------------------
import { askQuestionSchema } from "./modules/chat/interface/ask-question.schema";
import { TypeOrmChatMessageRepository } from "./modules/chat/infrastructure/typeorm-chat-message.repository";
import { MockAiProvider } from "./modules/chat/infrastructure/mock-ai.provider";
import { AskQuestionUseCase } from "./modules/chat/application/ask-question.usecase";
import { QuotaService } from "./modules/chat/application/quota.service";
import { TypeOrmUsageLedgerRepository } from "./modules/subscriptions/infrastructure/typeorm-usage-ledger.repository";

// --- jobs ------------------------------------------------------------------
import { runRenewalJob } from "./jobs/renewal.job";
import { startBillingScheduler } from "./jobs/billing-scheduler";

dotenv.config();

const app = express();

/**
 * GLOBAL middleware pipeline (runs for every request, in order):
 *  1. requestId   — correlate logs/errors for a single request.
 *  2. logger      — structured access log (emitted on response finish).
 *  3. per-IP rate limit — coarse flood protection BEFORE auth, so anonymous
 *     traffic is bounded.
 *  4. request timeout — upper bound on request duration.
 *  5. cors / helmet — restricted origins + secure headers.
 *  6. content-type + json body parser (64KB cap) — request-size + type limits.
 *
 * Per-route authentication and per-user rate limits are attached individually
 * on each route below (see `protectedRoute` + the per-group limiters).
 */
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(ipRateLimiter);
app.use(createRequestTimeout(REQUEST_TIMEOUT_MS));
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Timestamp",
      "X-Request-Signature",
      "X-Request-Id",
    ],
    credentials: true,
  })
);
app.use(helmet());
app.use(requireJsonContentType);
app.use(express.json({ limit: "64kb" }));

// ===========================================================================
// PUBLIC ROUTES
// ===========================================================================

// Liveness probe — no auth.
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "GGI Backend is running",
    timestamp: new Date().toISOString(),
  });
});

/**
 * DEV-ONLY token minting endpoint (disabled when NODE_ENV=production).
 *
 * Stands in for "log in via the IdP and receive a JWT". Hit it to obtain a
 * bearer token for manual testing:
 *   GET /dev/auth/token?role=admin&sub=alice&email=alice@example.com
 */
if (process.env.NODE_ENV !== "production") {
  app.get("/dev/auth/token", (req: Request, res: Response) => {
    const role = req.query.role === "admin" ? "admin" : "user";
    const sub =
      typeof req.query.sub === "string" ? req.query.sub : "keycloak-user-1";
    const email =
      typeof req.query.email === "string"
        ? req.query.email
        : "user@example.com";

    const token = mockOidcProvider.issueToken({ sub, email, role });

    return res.status(200).json({
      success: true,
      data: { token, tokenType: "Bearer", sub, email, role },
    });
  });
}

// ===========================================================================
// AUTHENTICATED ROUTES
// Each: ...protectedRoute (signature → JWT → user) + a per-group rate limit.
// ===========================================================================

// Returns the authenticated identity + persisted user.
app.get(
  "/me",
  ...protectedRoute,
  defaultUserRateLimiter,
  (req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      data: {
        authUser: req.authUser,
        currentUser: req.currentUser,
      },
    });
  }
);

// --- subscriptions ---------------------------------------------------------

app.post(
  "/subscriptions",
  ...protectedRoute,
  subscriptionRateLimiter,
  validateBody(createSubscriptionSchema),
  async (req: Request, res: Response) => {
    const subscriptionRepository = new TypeOrmSubscriptionRepository();
    const createSubscriptionUseCase = new CreateSubscriptionUseCase(
      subscriptionRepository
    );

    const subscription = await createSubscriptionUseCase.execute({
      userId: req.currentUser!.id,
      tier: req.body.tier,
      billingCycle: req.body.billingCycle,
      autoRenew: req.body.autoRenew,
    });

    return res.status(201).json({
      success: true,
      data: { subscription },
    });
  }
);

app.get(
  "/subscriptions",
  ...protectedRoute,
  subscriptionRateLimiter,
  async (req: Request, res: Response) => {
    const subscriptionRepository = new TypeOrmSubscriptionRepository();

    const subscriptions = await subscriptionRepository.findByUserId(
      req.currentUser!.id
    );

    return res.status(200).json({
      success: true,
      data: { subscriptions },
    });
  }
);

app.post(
  "/subscriptions/:id/cancel",
  ...protectedRoute,
  subscriptionRateLimiter,
  async (req: Request<{ id: string }>, res: Response) => {
    const subscriptionRepository = new TypeOrmSubscriptionRepository();
    const cancelSubscriptionUseCase = new CancelSubscriptionUseCase(
      subscriptionRepository
    );

    const subscription = await cancelSubscriptionUseCase.execute({
      subscriptionId: req.params.id,
      currentUserId: req.currentUser!.id,
    });

    return res.status(200).json({
      success: true,
      data: { subscription },
    });
  }
);

// --- chat ------------------------------------------------------------------

app.post(
  "/chat",
  ...protectedRoute,
  chatRateLimiter,
  validateBody(askQuestionSchema),
  async (req: Request, res: Response) => {
    const chatRepository = new TypeOrmChatMessageRepository();
    const aiProvider = new MockAiProvider();
    const quotaService = new QuotaService();
    const usageLedgerRepository = new TypeOrmUsageLedgerRepository();

    const askQuestionUseCase = new AskQuestionUseCase(
      chatRepository,
      aiProvider,
      quotaService,
      usageLedgerRepository
    );

    const chatMessage = await askQuestionUseCase.execute({
      userId: req.currentUser!.id,
      question: req.body.question,
      metadata: {
        requestId: req.requestId,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      },
    });

    return res.status(201).json({
      success: true,
      data: { chatMessage },
    });
  }
);

app.get(
  "/chat",
  ...protectedRoute,
  chatRateLimiter,
  async (req: Request, res: Response) => {
    const chatRepository = new TypeOrmChatMessageRepository();

    const chatMessages = await chatRepository.findByUserId(req.currentUser!.id);

    return res.status(200).json({
      success: true,
      data: { chatMessages },
    });
  }
);

// --- admin (role: admin) ---------------------------------------------------

app.get(
  "/admin/usage-ledger",
  ...protectedRoute,
  adminRateLimiter,
  requireRole(["admin"]),
  async (_req: Request, res: Response, next) => {
    try {
      const usageLedgerRepository =
        AppDataSource.getRepository(UsageLedgerOrmEntity);

      const records = await usageLedgerRepository.find({
        order: { createdAt: "DESC" },
        take: 50,
      });

      return res.status(200).json({
        success: true,
        data: { records },
      });
    } catch (error) {
      return next(error);
    }
  }
);

app.get(
  "/admin/usage-summary",
  ...protectedRoute,
  adminRateLimiter,
  requireRole(["admin"]),
  async (_req: Request, res: Response, next) => {
    try {
      const usageLedgerRepository =
        AppDataSource.getRepository(UsageLedgerOrmEntity);

      const totalUsage = await usageLedgerRepository.count();
      const freeUsage = await usageLedgerRepository.count({
        where: { source: "free" },
      });
      const subscriptionUsage = await usageLedgerRepository.count({
        where: { source: "subscription" },
      });

      return res.status(200).json({
        success: true,
        data: { totalUsage, freeUsage, subscriptionUsage },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Manually trigger the billing renewal job (handy for demos/tests).
app.post(
  "/admin/billing/run-renewals",
  ...protectedRoute,
  adminRateLimiter,
  requireRole(["admin"]),
  async (_req: Request, res: Response, next) => {
    try {
      const summary = await runRenewalJob();

      return res.status(200).json({
        success: true,
        data: { summary },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Global error handler — must be registered LAST so it catches everything.
app.use(errorHandlerMiddleware);

const PORT = Number(process.env.PORT) || 3000;

/**
 * Boot sequence: connect the DB, start the optional billing scheduler, then
 * listen. With migrations as the schema source of truth, run `npm run
 * migration:run` once before starting (or set DB_SYNCHRONIZE=true for a quick
 * throwaway DB).
 */
async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    startBillingScheduler();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

bootstrap();
