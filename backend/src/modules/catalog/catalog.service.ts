import { pool, query } from "../../config/db.js";
import { ApiError } from "../../utils/api.response.utils.js";
import type { PoolClient } from "pg";
import type { CreateProductDTO, UpdateProductDTO } from "./dto/catalog.dto.js";

type CatalogImage = { url: string; position: number };
type CatalogVariant = {
  name: string;
  options: Record<string, string>;
  price?: number | null;
  stock: number;
  sku?: string;
};

type ProductImageRow = { id: number; product_id: number; url: string; position: number };
type ProductVariantRow = {
  id: number;
  product_id: number;
  public_id?: string;
  product_public_id?: string;
  name: string;
  options: Record<string, string>;
  price: number | null;
  stock: number;
  sku: string | null;
};

function publicEntity(
  row: Record<string, unknown>,
  replacements: Record<string, unknown> = {}
) {
  const { id: _internalId, public_id: publicId, ...fields } = row;
  return { ...fields, ...replacements, id: publicId };
}

function firstImageByProduct(images: ProductImageRow[]): Map<number, string> {
  const firstImage = new Map<number, string>();
  for (const image of images) {
    if (!firstImage.has(image.product_id)) {
      firstImage.set(image.product_id, image.url);
    }
  }
  return firstImage;
}

function variantsByProduct(variants: ProductVariantRow[]): Map<number, ProductVariantRow[]> {
  const grouped = new Map<number, ProductVariantRow[]>();
  for (const variant of variants) {
    const productVariants = grouped.get(variant.product_id) ?? [];
    productVariants.push(variant);
    grouped.set(variant.product_id, productVariants);
  }
  return grouped;
}

function productImages(value: {
  image?: string | null;
  images?: string[];
}): string[] | undefined {
  if (value.images !== undefined) return value.images;
  if (value.image !== undefined) return value.image ? [value.image] : [];
  return undefined;
}

function productVariants(value: {
  sizes?: Array<{ name: string; stock: number; price?: number | null; sku?: string }>;
  variants?: CatalogVariant[];
}): CatalogVariant[] | undefined {
  if (value.variants !== undefined) return value.variants;
  if (value.sizes !== undefined) {
    return value.sizes.map((size) => ({
      ...size,
      options: { size: size.name },
    }));
  }
  return undefined;
}

async function replaceImages(
  client: PoolClient,
  productId: number,
  images: string[]
): Promise<void> {
  await client.query("DELETE FROM product_images WHERE product_id=$1", [productId]);
  for (const [position, url] of images.entries()) {
    await client.query(
      "INSERT INTO product_images(product_id,url,position) VALUES($1,$2,$3)",
      [productId, url, position]
    );
  }
}

async function replaceVariants(
  client: PoolClient,
  productId: number,
  variants: CatalogVariant[],
  defaultStock: number
): Promise<void> {
  const existing = await client.query(
    "SELECT id,name,options,price,stock,sku,active FROM product_variants WHERE product_id=$1 FOR UPDATE",
    [productId]
  );
  const byName = new Map<string, (typeof existing.rows)[number]>(
    existing.rows.map((variant) => [variant.name, variant])
  );
  const retained = new Set<number>();

  for (const variant of variants) {
    const previous = byName.get(variant.name);
    if (previous) {
      retained.add(previous.id);
      await client.query(
        `UPDATE product_variants
         SET options=$1,price=$2,stock=$3,sku=$4,active=true
         WHERE id=$5 AND product_id=$6`,
        [
          JSON.stringify(variant.options),
          variant.price === undefined ? previous.price : variant.price,
          variant.stock ?? previous.stock ?? defaultStock,
          variant.sku ?? previous.sku,
          previous.id,
          productId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO product_variants(product_id,name,options,price,stock,sku)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          productId,
          variant.name,
          JSON.stringify(variant.options),
          variant.price ?? null,
          variant.stock ?? defaultStock,
          variant.sku ?? null,
        ]
      );
    }
  }

  for (const variant of existing.rows) {
    if (variant.active && !retained.has(variant.id) && !variants.some((item) => item.name === variant.name)) {
      await client.query(
      "UPDATE product_variants SET active=false WHERE id=$1 AND product_id=$2",
        [variant.id, productId]
      );
    }
  }
}

async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    const code = (error as { code?: string }).code;
    if (code === "23505") throw ApiError.conflict("A product or variant with this SKU already exists.");
    if (code === "23503") throw ApiError.conflict("The selected category or variant is in use.");
    throw error;
  } finally {
    client.release();
  }
}

export class CatalogService {
  async listCategories() {
    const result = await query(
      "SELECT public_id AS id,name,slug,active,created_at FROM categories WHERE active=true ORDER BY name"
    );
    return result.rows;
  }

  async listProducts(filters: {
    search?: string;
    category?: string;
    sort?: string;
  }) {
    const sortColumns: Record<string, string> = {
      price_asc: "p.price ASC",
      price_desc: "p.price DESC",
      popular: "p.best_seller DESC,p.created_at DESC",
      rating: "p.rating DESC,p.created_at DESC",
      newest: "p.created_at DESC",
    };
    const values: string[] = [];
    let sql = `
      SELECT p.*,c.public_id AS category_public_id,c.name AS category_name,c.slug AS category_slug
      FROM products p
      JOIN categories c ON c.id=p.category_id
      WHERE p.active=true AND c.active=true`;

    if (filters.search?.trim()) {
      values.push(`%${filters.search.trim()}%`);
      sql += ` AND (p.name ILIKE $${values.length} OR p.description ILIKE $${values.length}
        OR p.sku ILIKE $${values.length} OR c.name ILIKE $${values.length})`;
    }
    if (filters.category?.trim()) {
      values.push(filters.category.trim());
      sql += ` AND c.slug=$${values.length}`;
    }
    sql += ` ORDER BY ${sortColumns[filters.sort || "newest"] || sortColumns.newest}`;
    const products = (await query(sql, values)).rows;
    if (!products.length) return products;
    const images = await query<ProductImageRow>(
      "SELECT id,product_id,url,position FROM product_images ORDER BY position,id"
    );
    const firstImages = firstImageByProduct(images.rows);
    return products.map((product) => {
      const { category_public_id, ...row } = product;
      return publicEntity(row, {
        category_id: category_public_id,
        image: firstImages.get(product.id) ?? "",
      });
    });
  }

  async getProduct(productId: string) {
    const productResult = await query(
      `SELECT p.*,c.public_id AS category_public_id,c.name AS category_name,c.slug AS category_slug
       FROM products p JOIN categories c ON c.id=p.category_id
       WHERE p.public_id=$1 AND p.active=true AND c.active=true`,
      [productId]
    );
    if (!productResult.rowCount) throw ApiError.notFound("Product not found");

    const [images, variants] = await Promise.all([
      query(
        `SELECT i.public_id AS id,p.public_id AS product_id,i.url,i.alt,i.position
         FROM product_images i JOIN products p ON p.id=i.product_id
         WHERE p.public_id=$1 ORDER BY i.position`,
        [productId]
      ),
      query(
        `SELECT v.public_id AS id,p.public_id AS product_id,v.name,v.options,v.price,v.stock,v.sku
         FROM product_variants v JOIN products p ON p.id=v.product_id
         WHERE p.public_id=$1 AND v.active=true ORDER BY v.id`,
        [productId]
      ),
    ]);
    const { category_public_id, ...product } = productResult.rows[0];
    return {
      ...publicEntity(product, { category_id: category_public_id }),
      images: images.rows,
      variants: variants.rows,
    };
  }

  async listAdminProducts() {
    const result = await query(`
      SELECT p.*,c.public_id AS category_public_id,c.name AS category_name
      FROM products p JOIN categories c ON c.id=p.category_id
      ORDER BY p.created_at DESC`);
    if (!result.rows.length) return result.rows;
    const [images, variants] = await Promise.all([
      query<ProductImageRow>(
        "SELECT id,product_id,url,position FROM product_images ORDER BY position,id"
      ),
      query<ProductVariantRow>(
        `SELECT v.id,v.product_id,v.public_id,v.name,v.options,v.price,v.stock,v.sku,
          p.public_id AS product_public_id
         FROM product_variants v JOIN products p ON p.id=v.product_id
         WHERE v.active=true ORDER BY v.id`
      ),
    ]);
    const firstImages = firstImageByProduct(images.rows);
    const variantsById = variantsByProduct(variants.rows);
    return result.rows.map((product) => {
      const { category_public_id, ...row } = product;
      const sizes = (variantsById.get(product.id) ?? []).map((variant) => ({
        ...variant,
        id: variant.public_id,
        product_id: variant.product_public_id,
        public_id: undefined,
        product_public_id: undefined,
      }));
      return publicEntity(row, {
        category_id: category_public_id,
        image: firstImages.get(product.id) ?? "",
        sizes,
      });
    });
  }

  private async getAdminProduct(productId: number) {
    const result = await query(
      `SELECT p.*,c.public_id AS category_public_id,c.name AS category_name
       FROM products p JOIN categories c ON c.id=p.category_id
       WHERE p.id=$1`,
      [productId]
    );
    if (!result.rowCount) throw ApiError.notFound("Product not found.");
    const [images, variants] = await Promise.all([
      query<ProductImageRow>(
        "SELECT id,product_id,url,position FROM product_images WHERE product_id=$1 ORDER BY position,id",
        [productId]
      ),
      query<ProductVariantRow>(
      `SELECT v.public_id AS id,p.public_id AS product_id,v.name,v.options,v.price,v.stock,v.sku
       FROM product_variants v JOIN products p ON p.id=v.product_id
       WHERE v.product_id=$1 AND v.active=true ORDER BY v.id`,
      [productId]
      ),
    ]);
    const { category_public_id, ...product } = result.rows[0];
    return {
      ...publicEntity(product, { category_id: category_public_id }),
      image: images.rows[0]?.url ?? "",
      sizes: variants.rows,
    };
  }

  async createProduct(value: CreateProductDTO) {
    const productId = await withTransaction(async (client) => {
      const category = await client.query(
        "SELECT id FROM categories WHERE public_id=$1 AND active=true",
        [value.categoryId]
      );
      if (!category.rowCount) throw ApiError.badRequest("Active category not found.");

      const inserted = await client.query(
        `INSERT INTO products(name,category_id,description,price,discount_price,stock,sku,brand,featured,new_arrival,best_seller)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          value.name,
          category.rows[0].id,
          value.description,
          value.price,
          value.discountPrice ?? null,
          value.stock,
          value.sku,
          value.brand ?? null,
          value.featured ?? false,
          value.newArrival ?? false,
          value.bestSeller ?? false,
        ]
      );
      const product = inserted.rows[0];
      const images = productImages(value);
      const variants = productVariants(value);
      if (images !== undefined) await replaceImages(client, product.id, images);
      if (variants !== undefined) {
        await replaceVariants(client, product.id, variants, value.stock);
      }
      return product.id as number;
    });
    return this.getAdminProduct(productId);
  }

  async updateProduct(publicProductId: string, value: UpdateProductDTO) {
    const updatedProductId = await withTransaction(async (client) => {
      const currentProduct = await client.query(
        "SELECT id FROM products WHERE public_id=$1 FOR UPDATE",
        [publicProductId]
      );
      if (!currentProduct.rowCount) throw ApiError.notFound("Product not found.");
      const productId = currentProduct.rows[0].id as number;
      const assignments: string[] = [];
      const params: unknown[] = [];
      const columns: Record<string, string> = {
        name: "name",
        description: "description",
        price: "price",
        discountPrice: "discount_price",
        stock: "stock",
        sku: "sku",
        brand: "brand",
        active: "active",
        featured: "featured",
        newArrival: "new_arrival",
        bestSeller: "best_seller",
      };

      for (const [key, column] of Object.entries(columns)) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          params.push(value[key as keyof UpdateProductDTO]);
          assignments.push(`${column}=$${params.length}`);
        }
      }

      if (value.categoryId !== undefined) {
        const category = await client.query(
          "SELECT id FROM categories WHERE public_id=$1 AND active=true",
          [value.categoryId]
        );
        if (!category.rowCount) throw ApiError.badRequest("Active category not found.");
        params.push(category.rows[0].id);
        assignments.push(`category_id=$${params.length}`);
      }

      let product: Record<string, unknown>;
      if (assignments.length) {
        params.push(productId);
        const updated = await client.query(
          `UPDATE products SET ${assignments.join(",")},updated_at=now()
           WHERE id=$${params.length} RETURNING *`,
          params
        );
        if (!updated.rowCount) throw ApiError.notFound("Product not found.");
        product = updated.rows[0];
      } else {
        const existing = await client.query(
          "SELECT * FROM products WHERE id=$1",
          [productId]
        );
        if (!existing.rowCount) throw ApiError.notFound("Product not found.");
        product = existing.rows[0];
      }

      const images = productImages(value);
      const variants = productVariants(value);
      if (images !== undefined) await replaceImages(client, productId, images);
      if (variants !== undefined) {
        await replaceVariants(client, productId, variants, Number(product.stock));
      }
      return productId;
    });
    return this.getAdminProduct(updatedProductId);
  }

  async removeProduct(productId: string) {
    const result = await query(
      "UPDATE products SET active=false,updated_at=now() WHERE public_id=$1 RETURNING public_id AS id,active",
      [productId]
    );
    if (!result.rowCount) throw ApiError.notFound("Product not found.");
    return result.rows[0];
  }

  async createVariant(
    publicProductId: string,
    value: { name: string; stock: number; price?: number | null; sku?: string }
  ) {
    return withTransaction(async (client) => {
      const product = await client.query(
        "SELECT id FROM products WHERE public_id=$1 FOR UPDATE",
        [publicProductId]
      );
      if (!product.rowCount) throw ApiError.notFound("Product not found.");
      const productId = product.rows[0].id as number;
      const duplicate = await client.query(
        "SELECT id FROM product_variants WHERE product_id=$1 AND lower(name)=lower($2) AND active=true",
        [productId, value.name]
      );
      if (duplicate.rowCount) {
        throw ApiError.conflict("A variant with this name already exists for the product.");
      }
      const inserted = await client.query(
        `INSERT INTO product_variants(product_id,name,options,price,stock,sku)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          productId,
          value.name,
          JSON.stringify({ size: value.name }),
          value.price ?? null,
          value.stock,
          value.sku ?? null,
        ]
      );
      return {
        ...inserted.rows[0],
        id: inserted.rows[0].public_id,
        product_id: publicProductId,
        public_id: undefined,
      };
    });
  }

  async createCategory(value: { name: string; slug: string }) {
    try {
      const result = await query(
        "INSERT INTO categories(name,slug) VALUES($1,$2) RETURNING public_id AS id,name,slug,active,created_at",
        [value.name, value.slug]
      );
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw ApiError.conflict("A category with this name or slug already exists.");
      }
      throw error;
    }
  }

  async updateCategory(
    categoryId: string,
    value: { name?: string; active?: boolean }
  ) {
    try {
      const result = await query(
        `UPDATE categories SET name=COALESCE($1,name),active=COALESCE($2,active)
         WHERE public_id=$3 RETURNING public_id AS id,name,slug,active,created_at`,
        [value.name ?? null, value.active ?? null, categoryId]
      );
      if (!result.rowCount) throw ApiError.notFound("Category not found.");
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw ApiError.conflict("A category with this name already exists.");
      }
      throw error;
    }
  }

  async removeCategory(categoryId: string) {
    const result = await query(
      "UPDATE categories SET active=false WHERE public_id=$1 RETURNING public_id AS id,active",
      [categoryId]
    );
    if (!result.rowCount) throw ApiError.notFound("Category not found.");
    return result.rows[0];
  }

  async updateVariant(productId: string, variantId: string, value: Record<string, unknown>) {
    const columns: Record<string, string> = {
      name: "name",
      options: "options",
      price: "price",
      stock: "stock",
      sku: "sku",
    };
    const params: unknown[] = [];
    const assignments = Object.entries(columns)
      .filter(([key]) => Object.prototype.hasOwnProperty.call(value, key))
      .map(([key, column]) => {
        const item = value[key];
        params.push(key === "options" ? JSON.stringify(item) : item);
        return `${column}=$${params.length}`;
      });
    params.push(variantId, productId);
    try {
      const result = await query(
        `UPDATE product_variants SET ${assignments.join(",")}
         WHERE public_id=$${params.length - 1}
           AND product_id=(SELECT id FROM products WHERE public_id=$${params.length})
           AND active=true
         RETURNING public_id AS id,product_id,name,options,price,stock,sku`,
        params
      );
      if (!result.rowCount) throw ApiError.notFound("Variant not found.");
      const product = await query(
        "SELECT public_id FROM products WHERE public_id=$1",
        [productId]
      );
      return { ...result.rows[0], product_id: product.rows[0].public_id };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw ApiError.conflict("A variant with this SKU already exists.");
      }
      throw error;
    }
  }

  async removeVariant(productId: string, variantId: string) {
    const result = await query(
      `UPDATE product_variants SET active=false
       WHERE public_id=$1 AND product_id=(SELECT id FROM products WHERE public_id=$2)
         AND active=true RETURNING public_id AS id`,
      [variantId, productId]
    );
    if (!result.rowCount) throw ApiError.notFound("Variant not found.");
  }
}
