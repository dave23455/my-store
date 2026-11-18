import { z } from "zod";

export const InitializePaymentSchema = z.object({
  orderId: z.string().uuid(),
});

export const ManualPaymentConfirmationSchema = z.object({
  orderId: z.string().uuid(),
  payerName: z.string().trim().min(2).max(150),
  amount: z.number().positive(),
  reference: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type InitializePaymentDTO = z.infer<typeof InitializePaymentSchema>;
export type ManualPaymentConfirmationDTO = z.infer<
  typeof ManualPaymentConfirmationSchema
>;
