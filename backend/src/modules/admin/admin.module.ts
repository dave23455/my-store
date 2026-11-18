import { Router } from "express";
import { adminOnly, isAuth, ownerOnly } from "../../middleware/auth.middleware.js";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { AdminController } from "./admin.controller.js";
import {
  CreateStaffSchema,
  ReviewPaymentConfirmationSchema,
  StoreSettingsSchema,
  UpdateAdminOrderSchema,
} from "./dto/admin.dto.js";

const controller = new AdminController();
const adminRouter = Router();

adminRouter.use(isAuth, adminOnly);

adminRouter.get("/dashboard", asyncHandler(controller.getDashboard));
adminRouter.get("/orders", asyncHandler(controller.listOrders));
adminRouter.patch(
  "/orders/:id",
  validateBody(UpdateAdminOrderSchema),
  asyncHandler(controller.updateOrder)
);
adminRouter.get("/customers", asyncHandler(controller.listCustomers));
adminRouter.get("/customers/:id/orders", asyncHandler(controller.listCustomerOrders));
adminRouter.get(
  "/payment-confirmations",
  asyncHandler(controller.listPaymentConfirmations)
);
adminRouter.patch(
  "/payment-confirmations/:id",
  validateBody(ReviewPaymentConfirmationSchema),
  asyncHandler(controller.reviewPaymentConfirmation)
);
adminRouter.get("/staff", asyncHandler(controller.listStaff));
adminRouter.post(
  "/staff",
  ownerOnly,
  validateBody(CreateStaffSchema),
  asyncHandler(controller.createStaff)
);
adminRouter.delete("/staff/:id", ownerOnly, asyncHandler(controller.removeStaff));
adminRouter.get("/settings", asyncHandler(controller.getSettings));
adminRouter.put(
  "/settings",
  validateBody(StoreSettingsSchema),
  asyncHandler(controller.updateSettings)
);

export default adminRouter;
