import { Router } from "express";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { isAuth } from "../../middleware/auth.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import {
  InitializePaymentSchema,
  ManualPaymentConfirmationSchema,
} from "./dto/payment.dto.js";
import { PaymentController } from "./payment.controller.js";

const controller = new PaymentController();
const paymentsRouter = Router();

paymentsRouter.use(isAuth);
paymentsRouter.post(
  "/initialize",
  validateBody(InitializePaymentSchema),
  asyncHandler(controller.initialize)
);
paymentsRouter.post(
  "/confirm",
  validateBody(ManualPaymentConfirmationSchema),
  asyncHandler(controller.confirm)
);
paymentsRouter.post("/:reference/cancel", asyncHandler(controller.cancel));
paymentsRouter.get("/:reference/verify", asyncHandler(controller.verify));

export default paymentsRouter;
