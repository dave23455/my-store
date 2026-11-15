import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { isAuth } from "../../middleware/auth.middleware.js";
import {
  RegisterSchema,
  LoginSchema,
  UpdateProfileSchema,
} from "./dto/auth.dto.js";
import otpRouter from "../otp/otp.module.js";

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

authRouter.use(otpRouter);

authRouter.post("/logout", asyncHandler(ctrl.logout));

export default authRouter;
