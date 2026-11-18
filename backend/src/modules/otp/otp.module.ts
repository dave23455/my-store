import { Router } from "express";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { OtpController } from "./otp.controller.js";
import {
  ForgotPasswordOtpSchema,
  ResetPasswordOtpSchema,
  ResendVerificationSchema,
  VerifyEmailSchema,
} from "./dto/otp.dto.js";

const controller = new OtpController();
const otpRouter = Router();

otpRouter.post(
  "/forgot-password",
  validateBody(ForgotPasswordOtpSchema),
  asyncHandler(controller.forgotPassword)
);
otpRouter.post(
  "/reset-password",
  validateBody(ResetPasswordOtpSchema),
  asyncHandler(controller.resetPassword)
);
otpRouter.post(
  "/verifyemail",
  validateBody(VerifyEmailSchema),
  asyncHandler(controller.verifyEmail)
);
otpRouter.post(
  "/resendverification",
  validateBody(ResendVerificationSchema),
  asyncHandler(controller.resendVerification)
);

export default otpRouter;
