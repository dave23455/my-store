import { useEffect, useMemo, useState } from "react";
import { API, Cart, Store, cartItemKey, defaultSettings, mapServerCart } from "./shared.jsx";

export function AppProviders({ children }) {
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("store-cart") || "[]"); }
    catch { return []; }
  });
  const [cartError, setCartError] = useState("");
  const [settings, setSettings] = useState(defaultSettings);
  useEffect(() => { localStorage.setItem("store-cart", JSON.stringify(cart)); }, [cart]);

  async function syncServerCart(token, guestItems) {
    const hasGuestItems = guestItems.length > 0;
    const response = await fetch(API + (hasGuestItems ? "/cart/merge" : "/cart"), {
      method: hasGuestItems ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        ...(hasGuestItems ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasGuestItems
        ? {
            body: JSON.stringify({
              items: guestItems.map((item) => ({
                productId: item.product_id ?? item.id,
                variantId: item.variant_id ?? item.variantId ?? null,
                quantity: Number(item.quantity),
              })),
            }),
          }
        : {}),
    });
    const result = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(result.message || "Your saved bag could not be synced.");
    }
    const items = mapServerCart(result);
    setCart(items);
    setCartError("");
    return items;
  }

  useEffect(() => {
    const sync = () => {
      const token = localStorage.getItem("token");
      if (!token) {
        // User logged out: clear stored cart state so guest doesn't inherit user's server cart
        try {
          const stored = JSON.parse(localStorage.getItem("store-cart") || "[]");
          setCart(stored);
        } catch {
          setCart([]);
        }
        return;
      }
      let guestItems = [];
      try {
        guestItems = JSON.parse(localStorage.getItem("store-cart") || "[]");
      } catch {
        setCartError("Your saved bag could not be read. Remove it or try again.");
        return;
      }
      syncServerCart(token, guestItems).then(() => {
        // Once successfully merged into server cart, clear local guest bag
        if (guestItems.length > 0) {
          localStorage.removeItem("store-cart");
        }
      }).catch((error) => {
        setCartError(error.message || "Your saved bag could not be synced.");
      });
    };
    sync();
    window.addEventListener("store-auth-changed", sync);
    return () => window.removeEventListener("store-auth-changed", sync);
  }, []);

  function authHeaders() {
    const token = localStorage.getItem("token");
    return token ? { Authorization: "Bearer " + token, "Content-Type": "application/json" } : null;
  }
  useEffect(() => {
    fetch(API + "/settings")
      .then((r) => (r.ok ? r.json() : Promise.resolve(defaultSettings)))
      .then(setSettings)
      .catch(() => setSettings(defaultSettings));
  }, []);
  const value = useMemo(
    () => ({
      cart,
      cartError,
      retrySync: () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
          const guestItems = JSON.parse(localStorage.getItem("store-cart") || "[]");
          syncServerCart(token, guestItems).catch((error) => {
            setCartError(error.message || "Your saved bag could not be synced.");
          });
        } catch {
          setCartError("Your saved bag could not be read. Remove it or try again.");
        }
      },
      clear: () => {
        setCart([]);
        const headers = authHeaders();
        setCartError("");
        if (headers) {
          fetch(API + "/cart", { method: "DELETE", headers })
            .then((response) => {
              if (!response.ok) throw new Error("The saved bag could not be cleared.");
            })
            .catch((error) => setCartError(error.message));
        }
      },
      add: async (p) => {
        const headers = authHeaders();
        if (headers) {
          try {
            const response = await fetch(API + "/cart/items", {
              method: "POST",
              headers,
              body: JSON.stringify({
                productId: p.id,
                quantity: 1,
                variantId: p.variantId || null,
              }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || "Could not add this item.");
            await syncServerCart(localStorage.getItem("token"), []);
          } catch (error) {
            setCartError(error.message || "Could not add this item.");
          }
          return;
        }
        setCart((c) => {
          const candidate = { ...p, variantId: p.variantId ?? null };
          const key = cartItemKey(candidate);
          const existing = c.find((item) => cartItemKey(item) === key);
          if (existing) {
            return c.map((item) =>
              cartItemKey(item) === key
                ? { ...item, quantity: Math.min(item.quantity + 1, p.stock) }
                : item
            );
          }
          return [...c, { ...candidate, quantity: 1, cartKey: key }];
        });
        setCartError("");
      },
      remove: async (key) => {
        const item = cart.find((entry) => cartItemKey(entry) === key);
        const headers = authHeaders();
        if (headers && item?.cartItemId) {
          try {
            const response = await fetch(API + "/cart/items/" + item.cartItemId, {
              method: "DELETE",
              headers,
            });
            if (!response.ok) throw new Error("Could not remove this item.");
          } catch (error) {
            setCartError(error.message || "Could not remove this item.");
            return;
          }
        }
        setCart((items) => items.filter((entry) => cartItemKey(entry) !== key));
        setCartError("");
      },
      change: async (key, delta) => {
        const item = cart.find((entry) => cartItemKey(entry) === key);
        if (!item) return;
        const quantity = Math.max(1, Math.min(item.stock, item.quantity + delta));
        const headers = authHeaders();
        if (headers && item.cartItemId) {
          try {
            const response = await fetch(API + "/cart/items/" + item.cartItemId, {
              method: "PUT",
              headers,
              body: JSON.stringify({ quantity }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || "Could not update quantity.");
            await syncServerCart(localStorage.getItem("token"), []);
          } catch (error) {
            setCartError(error.message || "Could not update quantity.");
          }
          return;
        }
        setCart((items) => items.map((entry) =>
          cartItemKey(entry) === key ? { ...entry, quantity } : entry
        ));
        setCartError("");
      },
    }),
    [cart, cartError],
  );
  return (
    <Store.Provider value={settings}>
      <Cart.Provider value={value}>{children}</Cart.Provider>
    </Store.Provider>
  );
}
