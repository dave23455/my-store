import express, { Express } from "express";
import helmet from "helmet";
import cors from "cors";
import YAML from "yamljs";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import apiRouter from "./routes/index.js";
import { limiter } from "./middleware/http.middleware.js";
import { errorHandler } from "./middleware/error-handler.middleware.js";

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
