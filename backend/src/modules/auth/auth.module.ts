import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { isAuth } from "../../middleware/auth.middleware.js";
import {
  RegisterSchema,
  LoginSchema,
  UpdateProfileSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "./dto/auth.dto.js";

const ctrl = new AuthController();
const authRouter = Router();

authRouter.post(
  "/register",
  validateBody(RegisterSchema),
  asyncHandler(ctrl.register)
);

authRouter.post(
  "/login",
  validateBody(LoginSchema),
  asyncHandler(ctrl.login)
);

authRouter.get("/me", isAuth, asyncHandler(ctrl.getMe));

authRouter.patch(
  "/me",
  isAuth,
  validateBody(UpdateProfileSchema),
  asyncHandler(ctrl.updateMe)
);

authRouter.post(
  "/forgot-password",
  validateBody(ForgotPasswordSchema),
  asyncHandler(ctrl.forgotPassword)
);

authRouter.post(
  "/reset-password",
  validateBody(ResetPasswordSchema),
  asyncHandler(ctrl.resetPassword)
);

authRouter.post("/logout", asyncHandler(ctrl.logout));

export default authRouter;
