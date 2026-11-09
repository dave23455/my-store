export enum UserRole {
  CUSTOMER = "customer",
  EMPLOYEE = "employee",
  ADMIN = "admin",
  OWNER = "owner",
}

export enum OrderStatus {
  PENDING_PAYMENT = "pending_payment",
  PAID = "paid",
  PROCESSING = "processing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

export enum PaymentStatus {
  PENDING = "pending",
  PAID = "paid",
  FAILED = "failed",
}

export enum PaymentProvider {
  PAYSTACK = "paystack",
  FLUTTERWAVE = "flutterwave",
  STRIPE = "stripe",
  NONE = "none",
}

export enum ConfirmationStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  phone?: string | null;
  created_at: Date;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  created_at: Date;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  options: Record<string, any>;
  price?: number | null;
  stock?: number | null;
  sku?: string | null;
}

export interface ProductImage {
  id: number;
  product_id: number;
  url: string;
  alt?: string | null;
  position: number;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  discount_price?: number | null;
  stock: number;
  sku: string;
  brand?: string | null;
  featured: boolean;
  new_arrival: boolean;
  best_seller: boolean;
  active: boolean;
  rating: number;
  created_at: Date;
  updated_at: Date;
}

export interface CartItem {
  id: number;
  cart_id: number;
  product_id: number;
  variant_id?: number | null;
  quantity: number;
}

export interface Order {
  id: number;
  user_id?: number | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  shipping_cost: number;
  total: number;
  shipping_address: Record<string, any>;
  tracking_number?: string | null;
  created_at: Date;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id?: number | null;
  variant_id?: number | null;
  name: string;
  unit_price: number;
  quantity: number;
}

export interface PaymentConfirmation {
  id: number;
  order_id: number;
  user_id?: number | null;
  payer_name: string;
  amount: number;
  reference?: string | null;
  notes?: string | null;
  status: ConfirmationStatus;
  reviewed_at?: Date | null;
  created_at: Date;
}
