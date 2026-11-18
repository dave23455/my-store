import { z } from "zod";

export const CartItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive().max(100),
});

export const AddCartItemSchema = CartItemInputSchema;
export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(100),
});
export const MergeCartSchema = z.object({
  items: z.array(CartItemInputSchema).max(100),
});

export type CartItemInput = z.infer<typeof CartItemInputSchema>;
