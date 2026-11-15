import { Router } from "express";
import { asyncHandler } from "../../middleware/http.middleware.js";
import { validateBody } from "../../middleware/validate-body.middleware.js";
import { adminOnly, isAuth } from "../../middleware/auth.middleware.js";
import { CatalogController } from "./catalog.controller.js";
import {
  CreateCategorySchema,
  CreateProductSchema,
  CreateVariantSchema,
  UpdateCategorySchema,
  UpdateProductSchema,
  UpdateVariantSchema,
} from "./dto/catalog.dto.js";

const controller = new CatalogController();
const catalogRouter = Router();
const adminCatalogRouter = Router();
const productsRouter = Router();
const categoriesRouter = Router();

catalogRouter.get("/categories", asyncHandler(controller.listCategories));
catalogRouter.get("/products", asyncHandler(controller.listProducts));
catalogRouter.get("/products/:id", asyncHandler(controller.getProduct));

productsRouter.get("/", asyncHandler(controller.listAdminProducts));
productsRouter.get("/manage", asyncHandler(controller.listAdminProducts));
productsRouter.post(
  "/",
  validateBody(CreateProductSchema),
  asyncHandler(controller.createProduct)
);
productsRouter.patch(
  "/:id",
  validateBody(UpdateProductSchema),
  asyncHandler(controller.updateProduct)
);
productsRouter.delete("/:id", asyncHandler(controller.removeProduct));
productsRouter.post(
  "/:id/sizes",
  validateBody(CreateVariantSchema),
  asyncHandler(controller.createVariant)
);
productsRouter.patch(
  "/:id/sizes/:variantId",
  validateBody(UpdateVariantSchema),
  asyncHandler(controller.updateVariant)
);
productsRouter.delete("/:id/sizes/:variantId", asyncHandler(controller.removeVariant));

categoriesRouter.post(
  "/",
  validateBody(CreateCategorySchema),
  asyncHandler(controller.createCategory)
);
categoriesRouter.patch(
  "/:id",
  validateBody(UpdateCategorySchema),
  asyncHandler(controller.updateCategory)
);
categoriesRouter.delete("/:id", asyncHandler(controller.removeCategory));

adminCatalogRouter.use(isAuth, adminOnly);
adminCatalogRouter.use("/products", productsRouter);
adminCatalogRouter.use("/categories", categoriesRouter);

export { adminCatalogRouter };
export default catalogRouter;
