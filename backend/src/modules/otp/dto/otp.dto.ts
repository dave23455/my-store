import { z } from "zod";

export const ForgotPasswordOtpSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const VerifyEmailSchema = z.object({
  userId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export const ResendVerificationSchema = z.object({
  userId: z.string().uuid(),
});

export type ForgotPasswordOtpDTO = z.infer<typeof ForgotPasswordOtpSchema>;
export type ResetPasswordOtpDTO = z.infer<typeof ResetPasswordOtpSchema>;
export type VerifyEmailDTO = z.infer<typeof VerifyEmailSchema>;
export type ResendVerificationDTO = z.infer<typeof ResendVerificationSchema>;
