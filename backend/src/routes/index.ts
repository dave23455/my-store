import { Router } from "express";
import authRouter from "../modules/auth/auth.module.js";
import cartRouter from "../modules/cart/cart.module.js";
import catalogRouter, { adminCatalogRouter } from "../modules/catalog/catalog.module.js";
import ordersRouter from "../modules/orders/orders.module.js";
import paymentsRouter from "../modules/payments/payment.module.js";
import adminRouter from "./admin.js";
import adminProductsRouter from "./admin-products.js";
import supportRouter from "./support.js";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/", catalogRouter);
apiRouter.use("/admin", adminCatalogRouter);
apiRouter.use("/cart", cartRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/payments", paymentsRouter);
// apiRouter.use("/admin", adminRouter);
// apiRouter.use("/admin/products", adminProductsRouter);
// apiRouter.use("/", supportRouter);

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));

export default apiRouter;
