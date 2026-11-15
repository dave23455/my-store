import { z } from "zod";

export const CreateOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive().max(100),
    variantId: z.string().uuid().nullable().optional(),
  })).min(1).max(100),
  shippingAddress: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().trim().max(50).optional(),
    country: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(300),
    postalCode: z.string().trim().max(50).optional(),
  }),
});
