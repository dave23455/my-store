import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api.response.utils.js";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ApiError) {
    res.status(err.status_code).json({
      success: false,
      status_code: err.status_code,
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  const errorObj = err as any;
  const status = errorObj?.status || errorObj?.statusCode || 500;
  const message = errorObj?.message || "Internal server error";

  res.status(status).json({
    success: false,
    status_code: status,
    code: errorObj?.code || "INTERNAL_SERVER_ERROR",
    message,
  });
};
