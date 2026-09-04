import { Router } from "express";
import { query } from "../config/db.js";
import { authenticate, adminOnly } from "../middleware/auth.js";
import { z } from "zod";
const r = Router();
r.use(authenticate, adminOnly);
const defaultSettings = {
  store_name: "LinaStyledYou",
  tag_line: "Premium beauty, delivered worldwide",
  logo_url: "",
  contact_email: "kehindelina@gmail.com",
  phone: "+2348065205096",
  whatsapp_number: "2348065205096",
  instagram_url: "https://instagram.com/linachili_linastyledyou",
  tiktok_url: "https://tiktok.com",
  whatsapp_message: "Hello! I would like to make an order.",
  currency: "NGN",
  shipping_message: "We ship worldwide",
  bank_name: "First Bank",
  bank_account_number: "3221851035",
  bank_account_name: "Arowosegbe Kehinde Lina",
};

r.get("/dashboard", async (req, res, next) => {
  try {
    const [sales, orders, customers, products, low, recent] = await Promise.all(
      [
        query(
          "SELECT COALESCE(SUM(total),0) total FROM orders WHERE payment_status='paid'",
        ),
        query(
          "SELECT count(*) total,count(*) FILTER(WHERE status=$1) pending,count(*) FILTER(WHERE status=$2) delivered FROM orders",
          ["processing", "delivered"],
        ),
        query("SELECT count(*) total FROM users WHERE role='customer'"),
        query("SELECT count(*) total FROM products"),
        query(
          "SELECT id,name,stock FROM products WHERE stock <= 5 AND active=true ORDER BY stock",
        ),
        query(
          "SELECT id,status,total,created_at FROM orders ORDER BY created_at DESC LIMIT 5",
        ),
      ],
    );
    res.json({
      sales: sales.rows[0].total,
      orders: orders.rows[0],
      customers: customers.rows[0].total,
      products: products.rows[0].total,
      lowStock: low.rows,
      recentOrders: recent.rows,
    });
  } catch (e) {
    next(e);
  }
});
r.get("/products", async (req, res, next) => {
  try {
    res.json(
      (
        await query(
          "SELECT p.*,c.name category_name,COALESCE((SELECT url FROM product_images WHERE product_id=p.id ORDER BY position LIMIT 1),'') image FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC",
        )
      ).rows,
    );
  } catch (e) {
    next(e);
  }
});
r.get("/products/manage", async (req, res, next) => {
  try {
    res.json(
      (
        await query(
          "SELECT p.*,c.name category_name,COALESCE((SELECT url FROM product_images WHERE product_id=p.id ORDER BY position LIMIT 1),'') image FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC",
        )
      ).rows,
    );
  } catch (e) {
    next(e);
  }
});
r.post("/products", async (req, res, next) => {
  try {
    const v = z
      .object({
        name: z.string().min(2),
        categoryId: z.number(),
        description: z.string(),
        price: z.number().nonnegative(),
        discountPrice: z.number().nullable().optional(),
        stock: z.number().int().nonnegative(),
        sku: z.string().min(2),
        brand: z.string().optional(),
        image: z.string().url().refine((value) => !/^https?:\/\/(www\.)?ibb\.co\//i.test(value), 'Use the direct image URL, such as https://i.ibb.co/.../photo.jpg').optional(),
        sizes: z
          .array(
            z.object({
              name: z.string(),
              stock: z.number().int().nonnegative(),
            }),
          )
          .optional(),
      })
      .parse(req.body);
    const x = await query(
        "INSERT INTO products(name,category_id,description,price,discount_price,stock,sku,brand) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          v.name,
          v.categoryId,
          v.description,
          v.price,
          v.discountPrice || null,
          v.stock,
          v.sku,
          v.brand || null,
        ],
      ),
      p = x.rows[0];
    if (v.image)
      await query("INSERT INTO product_images(product_id,url) VALUES($1,$2)", [
        p.id,
        v.image,
      ]);
    for (const s of v.sizes || [])
      await query(
        "INSERT INTO product_variants(product_id,name,options,stock) VALUES($1,$2,$3,$4)",
        [p.id, s.name, JSON.stringify({ size: s.name }), s.stock],
      );
    p.image = v.image || "";
    res.status(201).json(p);
  } catch (e) {
    next(e);
  }
});
r.patch("/products/:id", async (req, res, next) => {
  try {
    const v = z
      .object({
        active: z.boolean().optional(),
        featured: z.boolean().optional(),
        newArrival: z.boolean().optional(),
        bestSeller: z.boolean().optional(),
        stock: z.number().int().nonnegative().optional(),
        name: z.string().min(2).optional(),
        categoryId: z.number().optional(),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        discountPrice: z.number().nullable().optional(),
        sku: z.string().min(2).optional(),
        brand: z.string().nullable().optional(),
      })
      .parse(req.body);
    const fields = {
        active: "active",
        featured: "featured",
        newArrival: "new_arrival",
        bestSeller: "best_seller",
        stock: "stock",
        name: "name",
        categoryId: "category_id",
        description: "description",
        price: "price",
        discountPrice: "discount_price",
        sku: "sku",
        brand: "brand",
      },
      k = Object.keys(v);
    if (!k.length) return res.status(400).json({ message: "No updates" });
    const sets = k.map((x, i) => `${fields[x]}=$${i + 1}`).join(",");
    const x = await query(
      `UPDATE products SET ${sets},updated_at=now() WHERE id=$${k.length + 1} RETURNING *`,
      [...k.map((x) => v[x]), req.params.id],
    );
    res.json(x.rows[0]);
  } catch (e) {
    next(e);
  }
});
r.delete("/products/:id", async (req, res, next) => {
  try {
    await query("UPDATE products SET active=false WHERE id=$1", [
      req.params.id,
    ]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
r.get("/orders", async (req, res, next) => {
  try {
    res.json(
      (
        await query(
          "SELECT o.*,u.name,u.email FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC",
        )
      ).rows,
    );
  } catch (e) {
    next(e);
  }
});
r.get("/payment-confirmations", async (req, res, next) => {
  try { res.json((await query("SELECT pc.*,o.total AS order_total,u.name AS customer_name,u.email FROM payment_confirmations pc JOIN orders o ON o.id=pc.order_id LEFT JOIN users u ON u.id=pc.user_id ORDER BY pc.created_at DESC")).rows); }
  catch (e) { next(e); }
});
r.patch("/payment-confirmations/:id", async (req, res, next) => {
  try {
    const value = z.object({ status: z.enum(["approved", "rejected"]) }).parse(req.body);
    const result = await query("UPDATE payment_confirmations SET status=$1,reviewed_at=now() WHERE id=$2 RETURNING *", [value.status, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Payment confirmation not found" });
    if (value.status === "approved") await query("UPDATE orders SET payment_status='paid',status='paid' WHERE id=$1", [result.rows[0].order_id]);
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});
r.patch("/orders/:id", async (req, res, next) => {
  try {
    const v = z
      .object({
        status: z.enum([
          "pending_payment",
          "paid",
          "processing",
          "shipped",
          "delivered",
          "cancelled",
          "refunded",
        ]),
        trackingNumber: z.string().max(100).optional(),
      })
      .parse(req.body);
    const x = await query(
      "UPDATE orders SET status=$1,tracking_number=COALESCE($2,tracking_number) WHERE id=$3 RETURNING *",
      [v.status, v.trackingNumber || null, req.params.id],
    );
    res.json(x.rows[0]);
  } catch (e) {
    next(e);
  }
});
r.get("/customers", async (req, res, next) => {
  try {
    res.json(
      (
        await query(
          `SELECT u.id,u.name,u.email,u.phone,u.created_at,COALESCE(SUM(o.total) FILTER(WHERE o.payment_status='paid'),0) total_spending,COUNT(o.id) orders FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role IN('customer','employee') GROUP BY u.id ORDER BY u.created_at DESC`,
        )
      ).rows,
    );
  } catch (e) {
    next(e);
  }
});
r.get("/customers/:id/orders", async (req, res, next) => {
  try {
    res.json((await query("SELECT o.*,u.name,u.email FROM orders o JOIN users u ON u.id=o.user_id WHERE o.user_id=$1 ORDER BY o.created_at DESC", [req.params.id])).rows);
  } catch (e) { next(e); }
});
r.get("/settings", async (req, res, next) => {
  try {
    const x = await query("SELECT data FROM store_settings WHERE id=1");
    res.json(x.rowCount ? x.rows[0].data : {});
  } catch (e) {
    next(e);
  }
});
r.put("/settings", async (req, res, next) => {
  try {
    const v = z
      .object({
        store_name: z.string().optional(),
        tag_line: z.string().optional(),
        logo_url: z.string().optional(),
        contact_email: z.string().email().optional(),
        phone: z.string().optional(),
        whatsapp_number: z.string().optional(),
        instagram_url: z.string().optional(),
        tiktok_url: z.string().optional(),
        whatsapp_message: z.string().optional(),
        currency: z.string().optional(),
        shipping_message: z.string().optional(),
        bank_name: z.string().optional(),
        bank_account_number: z.string().optional(),
        bank_account_name: z.string().optional(),
      })
      .parse(req.body);
    const x = await query(
      "INSERT INTO store_settings(id,data,updated_at) VALUES(1,$1,now()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() RETURNING data",
      [JSON.stringify(v)],
    );
    res.json(x.rows[0].data);
  } catch (e) {
    next(e);
  }
});
r.post("/categories", async (req, res, next) => {
  try {
    const v = z
      .object({
        name: z.string().min(2),
        slug: z.string().regex(/^[a-z0-9-]+$/),
      })
      .parse(req.body);
    const x = await query(
      "INSERT INTO categories(name,slug) VALUES($1,$2) RETURNING *",
      [v.name, v.slug],
    );
    res.status(201).json(x.rows[0]);
  } catch (e) {
    next(e);
  }
});
r.patch("/categories/:id", async (req, res, next) => {
  try {
    const v = z
      .object({
        name: z.string().min(2).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const x = await query(
      "UPDATE categories SET name=COALESCE($1,name),active=COALESCE($2,active) WHERE id=$3 RETURNING *",
      [v.name || null, v.active ?? null, req.params.id],
    );
    res.json(x.rows[0]);
  } catch (e) {
    next(e);
  }
});
r.delete("/categories/:id", async (req, res, next) => {
  try {
    await query("DELETE FROM categories WHERE id=$1", [req.params.id]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
export default r;
