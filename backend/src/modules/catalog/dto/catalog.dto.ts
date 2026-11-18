import { z } from "zod";

const ProductVariantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  options: z.record(z.string()).default({}),
  price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative(),
  sku: z.string().min(1).max(100).optional(),
});

const ProductSizeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  stock: z.number().int().nonnegative(),
  price: z.number().nonnegative().nullable().optional(),
  sku: z.string().min(1).max(100).optional(),
});

export const CreateVariantSchema = ProductSizeSchema;

const ImageUrlSchema = z.string().url();

export const CreateProductSchema = z.object({
  name: z.string().min(2).max(255),
  categoryId: z.string().uuid(),
  description: z.string().max(10000).default(""),
  sizeGuide: z.string().max(10000).optional(),
  price: z.number().nonnegative(),
  discountPrice: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative(),
  sku: z.string().min(2).max(100),
  brand: z.string().max(100).nullable().optional(),
  featured: z.boolean().optional(),
  newArrival: z.boolean().optional(),
  bestSeller: z.boolean().optional(),
  image: z.union([ImageUrlSchema, z.literal("")]).nullable(),
  images: z.array(ImageUrlSchema).max(8).optional(),
  sizes: z.array(ProductSizeSchema).max(50).optional(),
  variants: z.array(ProductVariantSchema).max(50).optional(),
}).superRefine((value, context) => {
  if (value.sizes && value.variants) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Send sizes or variants, not both",
      path: ["variants"],
    });
  }
  const variantNames = (value.variants ?? value.sizes ?? []).map((variant) =>
    variant.name.trim().toLowerCase()
  );
  if (new Set(variantNames).size !== variantNames.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Variant names must be unique",
      path: ["variants"],
    });
  }
});

export const UpdateProductSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().max(10000).optional(),
  sizeGuide: z.string().max(10000).optional(),
  price: z.number().nonnegative().optional(),
  discountPrice: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().optional(),
  sku: z.string().min(2).max(100).optional(),
  brand: z.string().max(100).nullable().optional(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  newArrival: z.boolean().optional(),
  bestSeller: z.boolean().optional(),
  image: z.union([ImageUrlSchema, z.literal("")]).nullable().optional(),
  images: z.array(ImageUrlSchema).max(8).optional(),
  sizes: z.array(ProductSizeSchema).max(50).optional(),
  variants: z.array(ProductVariantSchema).max(50).optional(),
}).superRefine((value, context) => {
  if (value.sizes && value.variants) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Send sizes or variants, not both",
      path: ["variants"],
    });
  }
  const variantNames = (value.variants ?? value.sizes ?? []).map((variant) =>
    variant.name.trim().toLowerCase()
  );
  if (new Set(variantNames).size !== variantNames.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Variant names must be unique",
      path: ["variants"],
    });
  }
  if (Object.keys(value).length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one field is required",
    });
  }
});

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(120),
});

export const UpdateCategorySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export const UpdateVariantSchema = ProductVariantSchema.partial().extend({
  name: z.string().trim().min(1).max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export type CreateProductDTO = z.infer<typeof CreateProductSchema>;
export type UpdateProductDTO = z.infer<typeof UpdateProductSchema>;
