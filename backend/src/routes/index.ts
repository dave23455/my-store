import { Router } from "express";
import authRouter from "../modules/auth/auth.module.js";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);

apiRouter.get("/health", (_req, res) =>
  res.json({
    success: true,
    message: "healthy",
    data: { uptime: process.uptime() },
  })
);

export default apiRouter;
