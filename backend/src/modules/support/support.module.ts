import { Router } from "express";
import { adminOnly, isAuth } from "../../middleware/auth.middleware.js";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { SupportController } from "./support.controller.js";
import {
  CreateCommentSchema,
  CreateMessageSchema,
  CreateReviewSchema,
} from "./dto/support.dto.js";

const controller = new SupportController();
const supportRouter = Router();

supportRouter.get("/settings", asyncHandler(controller.getSettings));
supportRouter.get(
  "/products/:id/reviews",
  asyncHandler(controller.listReviews)
);
supportRouter.post(
  "/products/:id/reviews",
  isAuth,
  validateBody(CreateReviewSchema),
  asyncHandler(controller.createReview)
);
supportRouter.get(
  "/products/:id/comments",
  asyncHandler(controller.listComments)
);
supportRouter.post(
  "/products/:id/comments",
  isAuth,
  validateBody(CreateCommentSchema),
  asyncHandler(controller.createComment)
);
supportRouter.post(
  "/messages",
  validateBody(CreateMessageSchema),
  asyncHandler(controller.createMessage)
);
supportRouter.get(
  "/messages",
  isAuth,
  adminOnly,
  asyncHandler(controller.listMessages)
);

export default supportRouter;
