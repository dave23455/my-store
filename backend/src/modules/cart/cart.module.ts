import { Router } from "express";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { isAuth } from "../../middleware/auth.middleware.js";
import { CartController } from "./cart.controller.js";
import {
  AddCartItemSchema,
  MergeCartSchema,
  UpdateCartItemSchema,
} from "./dto/cart.dto.js";

const controller = new CartController();
const cartRouter = Router();

cartRouter.use(isAuth);
cartRouter.get("/", asyncHandler(controller.getCart));
cartRouter.delete("/", asyncHandler(controller.clearCart));
cartRouter.post("/items", validateBody(AddCartItemSchema), asyncHandler(controller.addItem));
cartRouter.put(
  "/items/:id",
  validateBody(UpdateCartItemSchema),
  asyncHandler(controller.updateItem)
);
cartRouter.delete("/items/:id", asyncHandler(controller.removeItem));
cartRouter.post("/merge", validateBody(MergeCartSchema), asyncHandler(controller.mergeItems));

export default cartRouter;
