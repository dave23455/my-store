import { Router } from "express";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { isAuth } from "../../middleware/auth.middleware.js";
import { OrdersController } from "./orders.controller.js";
import { CreateOrderSchema } from "./dto/orders.dto.js";

const controller = new OrdersController();
const ordersRouter = Router();

ordersRouter.use(isAuth);
ordersRouter.post("/", validateBody(CreateOrderSchema), asyncHandler(controller.create));
ordersRouter.get("/", asyncHandler(controller.list));
ordersRouter.patch("/:id/cancel", asyncHandler(controller.cancel));

export default ordersRouter;
