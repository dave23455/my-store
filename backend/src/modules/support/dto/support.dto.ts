import { z } from "zod";

export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().min(3).max(2000),
});

export const CreateCommentSchema = z.object({
  body: z.string().min(2).max(2000),
});

export const CreateMessageSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  body: z.string().min(3).max(3000),
});

export type CreateReviewDTO = z.infer<typeof CreateReviewSchema>;
export type CreateCommentDTO = z.infer<typeof CreateCommentSchema>;
export type CreateMessageDTO = z.infer<typeof CreateMessageSchema>;
