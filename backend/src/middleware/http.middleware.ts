import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction, RequestHandler } from "express";

export const asyncHandler =
  (fn: Function): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
