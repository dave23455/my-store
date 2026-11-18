import express, { Express } from "express";
import type { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import YAML from "yamljs";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import apiRouter from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.middleware.js";
import { asyncHandler, limiter } from "./middleware/http.middleware.js";
import { paymentService } from "./modules/payments/payment.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const swaggerDocument = YAML.load(join(__dirname, "swagger.yaml"));

export const createApp = (): Express => {
  const app = express();

  const defaultAllowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
  const allowedOrigins = [
    ...new Set([
      ...defaultAllowedOrigins,
      ...(process.env.CLIENT_URL || "").split(",").map((o) => o.trim()).filter(Boolean),
    ]),
  ];

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isAllowed =
          allowedOrigins.includes(origin) ||
          /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        return isAllowed
          ? callback(null, true)
          : callback(new Error("Origin is not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use(limiter);
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json" }),
    asyncHandler(async (req: Request, res: Response) => {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ message: "Invalid webhook payload" });
        return;
      }
      const signature = req.headers["x-paystack-signature"];
      if (!paymentService.validWebhook(signature, req.body)) {
        res.sendStatus(401);
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(req.body.toString());
      } catch {
        res.status(400).json({ message: "Invalid webhook payload" });
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        res.status(400).json({ message: "Invalid webhook payload" });
        return;
      }
      const event = payload as { event?: unknown; data?: { reference?: unknown } };

      if (
        event.event === "charge.success" &&
        typeof event.data?.reference === "string" &&
        event.data.reference.length > 0
      ) {
        await paymentService.verifyPayment(event.data.reference);
      }
      res.sendStatus(200);
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Swagger Documentation
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.get("/docs", (_req, res) => res.redirect("/api-docs"));
  app.get("/api/docs", (_req, res) => res.redirect("/api-docs"));

  // API Routes
  app.use("/api", apiRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
