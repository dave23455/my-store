import { z } from "zod";

export const ReviewPaymentConfirmationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export const UpdateAdminOrderSchema = z.object({
  status: z.enum([
    "pending_payment",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  trackingNumber: z.string().max(100).optional(),
});

export const CreateStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "owner"]).default("admin"),
});

export const StoreSettingsSchema = z.object({
  store_name: z.string().optional(),
  tag_line: z.string().optional(),
  logo_url: z.string().optional(),
  contact_email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp_number: z.string().optional(),
  instagram_url: z.string().optional(),
  tiktok_url: z.string().optional(),
  whatsapp_message: z.string().optional(),
  currency: z.string().optional(),
  shipping_message: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_account_name: z.string().optional(),
});

export type CreateStaffDTO = z.infer<typeof CreateStaffSchema>;
export type StoreSettingsDTO = z.infer<typeof StoreSettingsSchema>;
