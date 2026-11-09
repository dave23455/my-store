import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api.response.utils.js";
import { query } from "../config/db.js";
import { UserRole } from "../types/database.types.js";

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const isAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Authentication token required");
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const secret = process.env.JWT_SECRET || "default_secret";
    const payload = jwt.verify(token, secret) as { id: number; role: UserRole };

    const result = await query(
      "SELECT id, name, email, role, phone FROM users WHERE id = $1",
      [payload.id]
    );

    if (!result.rowCount) {
      throw ApiError.unauthorized("User account no longer exists");
    }

    req.user = result.rows[0] as AuthenticatedUser;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(ApiError.unauthorized("Invalid or expired authentication token"));
      return;
    }
    next(error);
  }
};

export const requireRole = (...roles: (UserRole | string)[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission to access this resource"));
    }
    next();
  };
};

export const adminOnly = requireRole(UserRole.ADMIN, UserRole.OWNER);
export const ownerOnly = requireRole(UserRole.OWNER);
