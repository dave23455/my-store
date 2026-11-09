import type { NextFunction, Request, Response } from "express";
import { ZodTypeAny, ZodError } from "zod";

export const validateBody =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        res.status(422).json({
          success: false,
          status_code: 422,
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          errors,
        });
        return;
      }
      return next(error);
    }
  };
