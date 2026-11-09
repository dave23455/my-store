import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(50).optional(),
});
export type RegisterDTO = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginDTO = z.infer<typeof LoginSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(50).optional(),
});
export type UpdateProfileDTO = z.infer<typeof UpdateProfileSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordDTO = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(20, "Invalid reset token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetPasswordDTO = z.infer<typeof ResetPasswordSchema>;
