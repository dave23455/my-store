import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");
export const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
export const useAutoMessage = (initialValue = "") => {
  const [message, setMessage] = useState(initialValue);
  const timeoutRef = useRef(null);
  useEffect(() => () => clearTimeout(timeoutRef.current), []);
  const showMessage = (msg, duration = 3000) => {
    setMessage(msg);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setMessage(""), duration);
  };
  const clearMessage = () => {
    setMessage("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };
  return [message, showMessage, clearMessage];
};
export const defaultSettings = {
  store_name: "LinaStyledYou",
  tag_line: "Premium beauty, delivered worldwide",
  logo_url: "/lina-styled-you-logo.jpeg",
  contact_email: "kehindelina@gmail.com",
  phone: "+2348065205096",
  whatsapp_number: "2348065205096",
  instagram_url: "https://www.instagram.com/linastyled.you?obrf=NW55b200cDQ5MWs%3D&utm_source=qr",
  tiktok_url: "https://www.tiktok.com/@linachili",
  whatsapp_message: "Hello! I would like to make an order.",
  currency: "NGN",
  shipping_message: "We ship worldwide",
  bank_name: "First Bank",
  bank_account_number: "3221851035",
  bank_account_name: "Arowosegbe Kehinde Lina",
};
export const Cart = createContext();
export const Store = createContext(defaultSettings);
export const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
export const compactMoney = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
export const cleanWhatsApp = (v) => String(v || "").replace(/\D/g, "");
export const cartItemKey = (item) =>
  `${item.product_id ?? item.id}:${item.variant_id ?? item.variantId ?? "base"}`;
export const mapServerCart = (items) =>
  items.map((item) => ({
    ...item,
    id: item.product_id,
    variantId: item.variant_id ?? null,
    cartItemId: item.id,
    cartKey: cartItemKey(item),
  }));
export function useCart() {
  return useContext(Cart);
}
export function useStore() {
  return useContext(Store);
}
