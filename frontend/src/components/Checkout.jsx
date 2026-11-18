import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, PAYSTACK_PUBLIC_KEY, cartItemKey, money, useAutoMessage, useCart, useStore } from "../shared.jsx";

export function CartPage() {
  const { cart, remove, change, cartError, retrySync } = useCart(),
    nav = useNavigate();
  const total = cart.reduce(
    (n, x) => n + (x.available === false ? 0 : (x.discount_price || x.price) * x.quantity),
    0,
  );
  const unavailableItems = cart.filter((item) => item.available === false);
  const overstockedItems = cart.filter(
    (item) => item.available !== false && item.quantity > item.stock,
  );
  return (
    <main className="page cart">
      <h1>Your bag</h1>
      {cartError && (
        <p role="alert">
          {cartError}{" "}
          <button className="link" onClick={retrySync}>Retry</button>
        </p>
      )}
      {!cart.length ? (
        <p>
          Your bag is waiting for something beautiful.{" "}
          <Link to="/shop">Shop now</Link>
        </p>
      ) : (
        <>
          <div>
            {cart.map((x) => (
              <div className="cartrow" key={x.cartKey || cartItemKey(x)}>
                <img src={x.image} />
                <div>
                  <h3>{x.name}</h3>
                  {x.variant_name && <p>{x.variant_name}</p>}
                  <strong>{money(x.discount_price || x.price)}</strong>
                  <p>
                    <button
                      disabled={x.available === false}
                      onClick={() => change(x.cartKey || cartItemKey(x), -1)}
                    >-</button>{" "}
                    {x.quantity}{" "}
                    <button
                      disabled={x.available === false || x.quantity >= x.stock}
                      onClick={() => change(x.cartKey || cartItemKey(x), 1)}
                    >+</button>
                  </p>
                  {x.available === false && <p>This item is no longer available. Remove it to continue.</p>}
                  {x.available !== false && x.quantity > x.stock && (
                    <p>Only {x.stock} available. Reduce the quantity to continue.</p>
                  )}
                </div>
                <button className="link" onClick={() => remove(x.cartKey || cartItemKey(x))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <aside>
            <p>
              Subtotal <strong>{money(total)}</strong>
            </p>
            {(unavailableItems.length > 0 || overstockedItems.length > 0) && (
              <p role="alert">Update or remove unavailable items before checkout.</p>
            )}
            <p>Shipping calculated at checkout</p>
            <button
              className="darkbtn"
              disabled={unavailableItems.length > 0 || overstockedItems.length > 0}
              onClick={() => nav("/checkout")}
            >
              Checkout -&gt;
            </button>
          </aside>
        </>
      )}
    </main>
  );
}
export function Checkout() {
  const { cart, clear } = useCart();
  const settings = useStore();
  const [message, showMessage, clearMessage] = useAutoMessage(),
    [orderId, setOrderId] = useState(""),
    [onlineOrderId, setOnlineOrderId] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [thankYou, setThankYou] = useState(false),
    [profile, setProfile] = useState(null),
    [confirmation, setConfirmation] = useState({
      payerName: "",
      amount: "",
      reference: "",
      notes: "",
    }),
    [form, setForm] = useState({
      name: "",
      email: "",
      phone: "",
      country: "",
      city: "",
      address: "",
      postalCode: "",
    }),
    token = localStorage.getItem("token"),
    nav = useNavigate(),
    redirectTimer = useRef();
  useEffect(() => {
    if (!token) return;
    fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + token } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || !data.user) return;
        setProfile(data.user);
        setForm((current) => ({
          ...current,
          name: current.name || data.user.name || "",
          email: current.email || data.user.email || "",
          phone: current.phone || data.user.phone || "",
        }));
      })
      .catch(() => {});
  }, [token]);
  async function confirmPayment(event) {
    event.preventDefault();
    const response = await fetch(API + "/payments/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        orderId,
        payerName: confirmation.payerName,
        amount: Number(confirmation.amount),
        reference: confirmation.reference || undefined,
        notes: confirmation.notes || undefined,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      setThankYou(true);
      redirectTimer.current = setTimeout(() => nav("/account"), 3000);
    } else
      setMessage(data.message || "Payment confirmation could not be sent.");
  }
  function stayOnCheckout() {
    clearTimeout(redirectTimer.current);
    setThankYou(false);
  }
  async function startOnlinePayment(targetOrderId) {
    if (!PAYSTACK_PUBLIC_KEY || !PAYSTACK_PUBLIC_KEY.startsWith("pk_test_")) {
      showMessage("Set a Paystack test public key in frontend/.env.local before testing payments.", 8000);
      return;
    }
    if (!window.PaystackPop) {
      showMessage("Paystack checkout did not load. Check your connection and reload the page.", 8000);
      return;
    }

    const response = await fetch(API + "/payments/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ orderId: targetOrderId }),
    });
    const details = await response.json().catch(() => ({}));
    if (!response.ok) {
      showMessage(details.message || "Could not start the payment.");
      return;
    }

    const cancelAttempt = async () => {
      const cancellation = await fetch(
        API + "/payments/" + encodeURIComponent(details.reference) + "/cancel",
        { method: "POST", headers: { Authorization: "Bearer " + token } },
      );
      if (!cancellation.ok) {
        const error = await cancellation.json().catch(() => ({}));
        throw new Error(error.message || "Could not close the payment attempt.");
      }
    };
    try {
      const popup = new window.PaystackPop();
      popup.newTransaction({
        key: PAYSTACK_PUBLIC_KEY,
        email: profile?.email || form.email,
        amount: details.amount,
        currency: details.currency,
        reference: details.reference,
        metadata: { order_id: targetOrderId },
        onSuccess: async (transaction) => {
          if (transaction.reference !== details.reference) {
            showMessage("Paystack returned a different payment reference. Please contact support.", 8000);
            return;
          }
          try {
            const verification = await fetch(
              API + "/payments/" + encodeURIComponent(transaction.reference) + "/verify",
              { headers: { Authorization: "Bearer " + token } },
            );
            const result = await verification.json().catch(() => ({}));
            if (!verification.ok || !result.paid) {
              showMessage(result.message || "Payment is not confirmed yet. Check your orders shortly.", 8000);
              return;
            }
            setOnlineOrderId("");
            showMessage("Payment confirmed. Your order is paid.", 5000);
            redirectTimer.current = setTimeout(() => nav("/account"), 1800);
          } catch {
            showMessage("Payment was submitted, but we could not verify it right now. Check your orders shortly.", 8000);
          }
        },
        onCancel: async () => {
          try {
            await cancelAttempt();
            showMessage("Payment was cancelled. You can retry payment for this order.");
          } catch (error) {
            showMessage(error.message || "Payment was closed, but the attempt could not be updated.", 8000);
          }
        },
        onError: async (error) => {
          try {
            await cancelAttempt();
          } catch {
            showMessage("Payment could not start and its attempt could not be closed. Please contact support.", 8000);
            return;
          }
          showMessage(error.message || "Paystack could not start the payment. You can retry.", 8000);
        },
      });
    } catch (error) {
      try {
        await cancelAttempt();
      } catch {
        showMessage("Payment could not start and its attempt could not be closed. Please contact support.", 8000);
        return;
      }
      showMessage(error.message || "Paystack checkout could not be opened.", 8000);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (!token) return showMessage("Please sign in before placing an order.");
    if (!PAYSTACK_PUBLIC_KEY || !PAYSTACK_PUBLIC_KEY.startsWith("pk_test_")) {
      return showMessage("Set a Paystack test public key in frontend/.env.local before testing payments.", 8000);
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(API + "/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.id,
            variantId: item.variantId || null,
            quantity: item.quantity,
          })),
          shippingAddress: {
            ...form,
            name: form.name || profile?.name || "Customer",
            email: form.email || profile?.email || "",
            phone: form.phone || profile?.phone || "",
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        showMessage(result.message || "Could not place your order.");
        return;
      }
      setOrderId(result.id);
      setOnlineOrderId(result.id);
      clear();
      await startOnlinePayment(result.id);
    } catch {
      showMessage("We could not reach the store. Please check your connection and try again.", 8000);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="page checkout">
      <h1>Checkout</h1>
      <p>{settings.shipping_message || "Worldwide delivery details"}</p>
      <form className="contact" onSubmit={submit}>
        {Object.entries(form).map(([k, v]) => (
          <input
            key={k}
            required={k !== "postalCode" && !(k === "email" || k === "name" || k === "phone")}
            readOnly={!!profile && (k === "email" || k === "name" || k === "phone")}
            placeholder={k.replace(/([A-Z])/g, " $1")}
            value={v}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
        ))}
        <button className="darkbtn" disabled={!cart.length || submitting}>
          {submitting ? "Preparing secure checkout..." : "Place order & pay"}
        </button>
      </form>
      {onlineOrderId && (
        <button
          className="darkbtn"
          type="button"
          disabled={submitting}
          onClick={() => startOnlinePayment(onlineOrderId)}
        >
          Retry payment
        </button>
      )}
      {message && <p>{message} <button type="button" className="link" onClick={clearMessage} style={{fontSize: '0.8em', marginLeft: '0.5em'}}>×</button></p>}
      {thankYou && (
        <div className="payment-thankyou">
          <strong>Thank you for shopping with us</strong>
          <span>Your payment confirmation was received.</span>
          <button className="link" type="button" onClick={stayOnCheckout}>
            Stay here
          </button>
        </div>
      )}
      {!token && <Link to="/login">Sign in or create an account -&gt;</Link>}
    </main>
  );
}
