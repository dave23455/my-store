function AccountDetails() {
  const [user, setUser] = useState(),
    [orders, setOrders] = useState([]),
    [displayName, setDisplayName] = useState(""),
    [nameMessage, setNameMessage] = useState(""),
    [accountError, setAccountError] = useState(""),
    nav = useNavigate();
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) {
      nav("/login");
      return;
    }
    const headers = { Authorization: "Bearer " + t };
    Promise.all([
      fetch(API + "/auth/me", { headers }),
      fetch(API + "/orders", { headers }),
    ])
      .then(async ([u, o]) => {
        if (!u.ok) {
          localStorage.removeItem("token");
          nav("/login");
          return;
        }
        const userData = await u.json();
        setUser(userData.user);
        setOrders(o.ok ? await o.json() : []);
      })
      .catch(() => setAccountError("We could not connect to your account. Please start the store API and try again."));
  }, [nav]);
  async function saveDisplayName(event) {
    event.preventDefault();
    const response = await fetch(API + "/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") }, body: JSON.stringify({ name: displayName }) });
    const data = await response.json();
    if (response.ok) { setUser(data.user); setDisplayName(data.user.name); setNameMessage("Name updated successfully."); }
    else setNameMessage(data.message || "Could not update your name.");
  }
  function logout() {
    localStorage.removeItem("token");
    nav("/login");
  }
  async function cancelOrder(orderId) {
    if (!window.confirm("Cancel this unpaid order?")) return;
    const response = await fetch(API + "/orders/" + orderId + "/cancel", {
      method: "PATCH",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
    });
    const data = await response.json();
    if (response.ok)
      setOrders((items) =>
        items.map((order) =>
          order.id === orderId ? { ...order, status: "cancelled" } : order,
        ),
      );
    else alert(data.message || "This order cannot be cancelled.");
  }
  if (accountError)
    return (
      <main className="page">
        <h1>Account unavailable</h1>
        <p>{accountError}</p>
        <button className="darkbtn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  if (!user) return <main className="page">Loading your account...</main>;
  return (
    <main className="page account-page">
      <div className="account-header">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>Welcome, {user.name}</h1>
        </div>
        <button className="link" onClick={logout}>
          Log out
        </button>
      </div>
      <section className="account-card">
        <h2>Your details</h2>
        <p>
          <b>Name:</b> {user.name}
        </p>
        <p>
          <b>Email:</b> {user.email}
        </p>
        <p>
          <b>Account type:</b> {user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Customer"}
        </p>
        <form className="name-form" onSubmit={saveDisplayName}>
          <label>Display name<input required minLength="2" maxLength="100" value={displayName || user.name} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <button className="darkbtn">Save name</button>
          {nameMessage && <small>{nameMessage} <button type="button" className="link" onClick={() => setNameMessage("")} style={{fontSize: '0.8em'}}>✕</button></small>}
        </form>
        {['admin', 'owner'].includes(user.role) && (
          <Link className="darkbtn" to="/admin">
            Open product catalog
          </Link>
        )}
      </section>
      <h2>Order history</h2>
      {orders.length ? (
        orders.map((o) => (
          <div className="account-order" key={o.id}>
            <span>
              Order #{o.id} - {o.status} - {money(o.total)}
            </span>
            {o.status === "pending_payment" &&
              o.payment_status === "pending" && (
                <button className="link" onClick={() => cancelOrder(o.id)}>
                  Cancel order
                </button>
              )}
          </div>
        ))
      ) : (
        <p>No orders yet.</p>
      )}
      <Link to="/shop">Continue shopping -&gt;</Link>
    </main>
  );
}
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import "./styles.css";
const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:4000/api");
const useAutoMessage = (initialValue = "") => {
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
const defaultSettings = {
  store_name: "LinaStyledYou",
  tag_line: "Premium beauty, delivered worldwide",
  logo_url: "/lina-styled-you-logo.jpeg",
  contact_email: "kehindelina@gmail.com",
  phone: "+2348065205096",
  whatsapp_number: "2348065205096",
  instagram_url: "https://instagram.com/linachili_linastyledyou",
  tiktok_url: "https://www.tiktok.com/@linachili",
  whatsapp_message: "Hello! I would like to make an order.",
  currency: "NGN",
  shipping_message: "We ship worldwide",
  bank_name: "First Bank",
  bank_account_number: "3221851035",
  bank_account_name: "Arowosegbe Kehinde Lina",
};
const Cart = createContext();
const Store = createContext(defaultSettings);
const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
const compactMoney = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
const cleanWhatsApp = (v) => String(v || "").replace(/\D/g, "");
function useCart() {
  return useContext(Cart);
}
function useStore() {
  return useContext(Store);
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-part brand-lina">Lina</span>
      <span className="brand-part brand-styled">Styled</span>
      <span className="brand-part brand-you">You</span>
    </span>
  );
}
function Header() {
  const settings = useStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const nav = useNavigate();
  const wa = cleanWhatsApp(settings.whatsapp_number);
  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
    if (!token) {
      setIsAdmin(false);
      return;
    }
    fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setIsAdmin(['admin', 'owner'].includes(data?.user?.role)))
      .catch(() => setIsAdmin(false));
  }, [location.pathname]);
  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
    setIsAdmin(false);
    nav("/login");
  };
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  return (
    <>
      <div className="notice">
        {settings.shipping_message || "We ship worldwide"} | Secure checkout |
        Made for your glow
      </div>
      <header>
        <Link className="logo" to="/">
          <Brand />
        </Link>
        <button
          className="menu-toggle"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={menuOpen ? "open" : ""}>
          <Link to="/shop">Shop</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/account">Account</Link>
          {isAdmin && (
            <Link className="admin-link" to="/admin">
              Manage products
            </Link>
          )}
          <a
            className="whatsapp-link"
            href={
              wa
                ? `https://wa.me/${wa}?text=${encodeURIComponent(settings.whatsapp_message || "Hello! I would like to make an order.")}`
                : "#"
            }
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
          {isLoggedIn ? (
            <button className="link" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <Link to="/login">Log in</Link>
          )}
          <Link className="cart-link" to="/cart" aria-label="Open cart">
            <span className="cart-icon" aria-hidden="true">
              🛒
            </span>
            <span>Cart</span> <b>{cart.reduce((n, x) => n + x.quantity, 0)}</b>
          </Link>
        </nav>
      </header>
    </>
  );
}
function ProductCard({ p }) {
  const { add } = useCart();
  return (
    <article className="card">
      <Link to={"/product/" + p.id}>
        <img src={p.image || "/lina-styled-you-logo.jpeg"} alt={p.name} />
        <div className="badge">{p.new_arrival ? "NEW" : "BEST SELLER"}</div>
        <h3>{p.name}</h3>
        <small>
          ***** <i>({p.rating || "New"})</i>
        </small>
        <strong>{money(p.discount_price || p.price)}</strong>
      </Link>
      <button onClick={() => add(p)}>Add</button>
    </article>
  );
}
function Home() {
  const [products, setProducts] = useState([]);
  const settings = useStore();
  useEffect(() => {
    fetch(API + "/products")
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => {});
  }, []);
  return (
    <>
      <section className="hero">
        <div>
          <p>YOUR EVERYDAY LUXURY</p>
          <h1>
            Beauty that
            <br />
            <em>moves with you.</em>
          </h1>
          <p className="lead">
            {settings.tag_line || "Premium beauty, delivered worldwide."}
          </p>
          <Link className="darkbtn" to="/shop">
            Shop new arrivals -&gt;
          </Link>
        </div>
        <div className="orb">
          <img
            src={settings.logo_url || "/lina-styled-you-logo.jpeg"}
            alt="LinaStyledYou logo"
          />
        </div>
      </section>
      <section className="intro">
        <p>ONE STORE. A WORLD OF POSSIBILITY.</p>
        <h2>
          {settings.tag_line || "Curated pieces for your most confident self."}
        </h2>
      </section>
      <section className="collection">
        <div className="sectionhead">
          <h2>Featured edits</h2>
          <Link to="/shop">View all -&gt;</Link>
        </div>
        <div className="grid">
          {products.slice(0, 3).map((p) => (
            <ProductCard p={p} key={p.id} />
          ))}
        </div>
      </section>
      <section className="shipping">
        <span>*</span>
        <div>
          <h2>{settings.shipping_message || "Worldwide delivery"}</h2>
          <p>
            Wherever your next chapter takes you, we will help you arrive
            beautifully.
          </p>
        </div>
        <Link to="/shop">Explore the collection -&gt;</Link>
      </section>
    </>
  );
}
function Shop() {
  const [products, setProducts] = useState([]),
    [q, setQ] = useState("");
  useEffect(() => {
    fetch(API + "/products?search=" + encodeURIComponent(q))
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => {});
  }, [q]);
  return (
    <main className="page">
      <p className="eyebrow">THE COLLECTION</p>
      <h1>Find your new favorite.</h1>
      <input
        className="search"
        placeholder="Search hair, beauty, bags..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid">
        {products.map((p) => (
          <ProductCard p={p} key={p.id} />
        ))}
      </div>
      {!products.length && (
        <p>
          Nothing found yet. Run the database seed to add the starter catalog.
        </p>
      )}
    </main>
  );
}
function Product() {
  const { id } = useParams(),
    [p, setP] = useState(),
    [choice, setChoice] = useState(""),
    [reviews, setReviews] = useState([]),
    [comments, setComments] = useState([]),
    [question, setQuestion] = useState(""),
    [rating, setRating] = useState("5"),
    [reviewBody, setReviewBody] = useState(""),
    [reviewMessage, showReviewMessage, clearReviewMessage] = useAutoMessage(),
    { add } = useCart();
  const token = localStorage.getItem("token");
  useEffect(() => {
    fetch(API + "/products/" + id)
      .then((r) => r.json())
      .then(setP);
    fetch(API + "/products/" + id + "/reviews")
      .then((r) => r.json())
      .then(setReviews);
    fetch(API + "/products/" + id + "/comments")
      .then((r) => r.json())
      .then(setComments);
  }, [id]);
  async function ask(e) {
    e.preventDefault();
    if (!token) return alert("Please sign in to send a question.");
    const r = await fetch(API + "/products/" + id + "/comments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ body: question }),
    });
    if (r.ok) {
      setComments([...comments, await r.json()]);
      setQuestion("");
    }
  }
  async function submitReview(e) {
    e.preventDefault();
    if (!token) return showReviewMessage("Please sign in to leave a rating.");
    const r = await fetch(API + "/products/" + id + "/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ rating: Number(rating), body: reviewBody }),
    });
    const data = await r.json();
    if (r.ok) {
      showReviewMessage("Thank you for rating this product.");
      setReviews((items) => [
        { ...data, name: "You" },
        ...items.filter((item) => item.name !== "You"),
      ]);
    } else showReviewMessage(data.message || "Could not save your rating.");
  }
  if (!p) return <main className="page">Loading product...</main>;
  const chosen = p.variants?.find((v) => v.id === Number(choice));
  const item = {
    ...p,
    price: chosen?.price || p.price,
    stock: chosen?.stock ?? p.stock,
    variantId: chosen?.id,
  };
  return (
    <>
      <main className="product">
        <img
          src={p.images?.[0]?.url || "/lina-styled-you-logo.jpeg"}
          alt={p.name}
        />
        <div>
          <p className="eyebrow">{p.category_name}</p>
          <h1>{p.name}</h1>
          <p className="stars">
            ★★★★★ <span>{Number(p.rating || 0).toFixed(1)}</span>
          </p>
          <h2>{money(p.discount_price || item.price)}</h2>
          <p>{p.description}</p>
          {p.variants?.length > 0 && (
            <label className="variant-label">
              Choose size / option
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">Select a size</option>
                {p.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {Object.values(v.options).join(" / ")} ({v.stock}{" "}
                    left)
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className={item.stock ? "in" : "out"}>
            {item.stock ? "In stock - ready to ship" : "Out of stock"}
          </p>
          <button
            className="darkbtn"
            disabled={!item.stock || (p.variants?.length && !choice)}
            onClick={() => add(item)}
          >
            Add
          </button>
          <p className="fine">
            Secure payment verified by our payment provider. Worldwide delivery
            available.
          </p>
        </div>
      </main>
      <section className="page feedback">
        <h2>Ratings & reviews</h2>
        {reviews.length ? (
          reviews.map((r) => (
            <p key={r.id}>
              <b>{r.name || "Verified buyer"}</b> · {"★".repeat(r.rating)}
              <br />
              {r.body}
            </p>
          ))
        ) : (
          <p>No reviews yet.</p>
        )}
        <form className="review-form" onSubmit={submitReview}>
          <h3>Rate this product</h3>
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </select>
          <textarea required minLength="3" value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="Write your review" />
          <button className="darkbtn">Submit rating</button>
          {reviewMessage && <p>{reviewMessage} <button type="button" className="link" onClick={clearReviewMessage}>×</button></p>}
        </form>
        <h2>Questions & chat</h2>
        {comments.map((c) => (
          <p key={c.id}>
            <b>{c.name || "Customer"}</b>: {c.body}
          </p>
        ))}
        <form className="contact" onSubmit={ask}>
          <textarea
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the store a question"
          />
          <button className="darkbtn">Send question</button>
        </form>
      </section>
    </>
  );
}
function CartPage() {
  const { cart, remove, change } = useCart(),
    nav = useNavigate();
  const total = cart.reduce(
    (n, x) => n + (x.discount_price || x.price) * x.quantity,
    0,
  );
  return (
    <main className="page cart">
      <h1>Your bag</h1>
      {!cart.length ? (
        <p>
          Your bag is waiting for something beautiful.{" "}
          <Link to="/shop">Shop now</Link>
        </p>
      ) : (
        <>
          <div>
            {cart.map((x) => (
              <div className="cartrow" key={x.id}>
                <img src={x.image} />
                <div>
                  <h3>{x.name}</h3>
                  <strong>{money(x.discount_price || x.price)}</strong>
                  <p>
                    <button onClick={() => change(x.id, -1)}>-</button>{" "}
                    {x.quantity}{" "}
                    <button onClick={() => change(x.id, 1)}>+</button>
                  </p>
                </div>
                <button className="link" onClick={() => remove(x.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <aside>
            <p>
              Subtotal <strong>{money(total)}</strong>
            </p>
            <p>Shipping calculated at checkout</p>
            <button className="darkbtn" onClick={() => nav("/checkout")}>
              Checkout -&gt;
            </button>
          </aside>
        </>
      )}
    </main>
  );
}
function Checkout() {
  const { cart, clear } = useCart();
  const settings = useStore();
  const [message, showMessage, clearMessage] = useAutoMessage(),
    [orderId, setOrderId] = useState(""),
    [thankYou, setThankYou] = useState(false),
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
  async function confirmPayment(event) {
    event.preventDefault();
    const response = await fetch(API + "/payments/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        orderId: Number(orderId),
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
  async function submit(e) {
    e.preventDefault();
    if (!token) return setMessage("Please sign in before placing your order.");
    const r = await fetch(API + "/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        items: cart.map((x) => ({
          productId: x.id,
          variantId: x.variantId || null,
          quantity: x.quantity,
        })),
        shippingAddress: form,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setOrderId(d.id);
      clear();
      const payment = await fetch(API + "/payments/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ orderId: d.id }),
      });
      const details = await payment.json();
      if (payment.ok && details.authorizationUrl) {
        window.location.assign(details.authorizationUrl);
        return;
      }
      setMessage(
        "Your order was received. Online payment is not available yet; use the bank-transfer details below.",
      );
    } else setMessage(d.message);
  }
  return (
    <main className="page checkout">
      <h1>Checkout</h1>
      <p>{settings.shipping_message || "Worldwide delivery details"}</p>
      <form className="contact" onSubmit={submit}>
        {Object.entries(form).map(([k, v]) => (
          <input
            key={k}
            required={k !== "postalCode"}
            placeholder={k.replace(/([A-Z])/g, " $1")}
            value={v}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
        ))}
        <button className="darkbtn" disabled={!cart.length}>
          Place order & pay
        </button>
      </form>
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
      {orderId && (
        <section className="payment-card">
          <p className="eyebrow">BANK TRANSFER</p>
          <h2>Pay for order #{orderId}</h2>
          <p>
            Transfer the order total to this account, then contact us on
            WhatsApp with your order number and payment receipt.
          </p>
          <p>
            <b>Bank:</b> {settings.bank_name}
          </p>
          <p>
            <b>Account number:</b> {settings.bank_account_number}
          </p>
          <p>
            <b>Account name:</b> {settings.bank_account_name}
          </p>
          <form className="payment-confirmation" onSubmit={confirmPayment}>
            <h3>Have you paid?</h3>
            <p>
              Send your transfer details for review. Your order will be marked
              paid after we confirm the transfer.
            </p>
            <input
              required
              placeholder="Name used for the transfer"
              value={confirmation.payerName}
              onChange={(e) =>
                setConfirmation({ ...confirmation, payerName: e.target.value })
              }
            />
            <input
              required
              type="number"
              min="1"
              placeholder="Amount paid"
              value={confirmation.amount}
              onChange={(e) =>
                setConfirmation({ ...confirmation, amount: e.target.value })
              }
            />
            <input
              placeholder="Bank reference (optional)"
              value={confirmation.reference}
              onChange={(e) =>
                setConfirmation({ ...confirmation, reference: e.target.value })
              }
            />
            <textarea
              placeholder="Note (optional)"
              value={confirmation.notes}
              onChange={(e) =>
                setConfirmation({ ...confirmation, notes: e.target.value })
              }
            />
            <button className="darkbtn">Confirm payment</button>
          </form>
        </section>
      )}{" "}
      {!token && <Link to="/login">Sign in or create an account -&gt;</Link>}
    </main>
  );
}
function Login() {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [register, setRegister] = useState(false),
    [msg, showMsg, clearMsg] = useAutoMessage(),
    [accountType, setAccountType] = useState(""),
    [submitting, setSubmitting] = useState(false),
    nav = useNavigate();
  const settings = useStore();
  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    clearMsg();
    try {
      const r = await fetch(API + "/auth/" + (register ? "register" : "login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, ...(register ? { name: name.trim() } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        showMsg(d.message || (register ? "Could not create your account." : "Could not sign you in."));
        return;
      }
      localStorage.setItem("token", d.token);
      setAccountType(d.user.role === "owner" ? "owner" : d.user.role === "admin" ? "admin" : "customer");
      nav("/account");
    } catch {
      showMsg("We could not reach the store. Please check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="page auth">
      <div className="auth-brand">
        <img
          src={settings.logo_url || "/lina-styled-you-logo.jpeg"}
          alt="LinaStyledYou"
        />
        <Brand />
      </div>
      <h1>{register ? "Welcome" : "Welcome back"}</h1>
      <p>
        {register
          ? "Create a customer account to track orders, review purchases, and check out faster."
          : "Your account permissions are determined securely by your email and password."}
      </p>
      <form onSubmit={submit}>
        {register && (
          <input
            required
            minLength="2"
            maxLength="100"
            placeholder="Name to display on your account"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          type="email"
          required
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength="8"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="darkbtn" disabled={submitting}>
          {submitting ? "Please wait..." : register ? "Create account" : "Sign in"}
        </button>
      </form>
      {msg && <p>{msg} <button type="button" className="link" onClick={clearMsg}>×</button></p>}
      {accountType && (
        <p>Signed in as {accountType === "admin" ? "admin" : "customer"}.</p>
      )}
      {!register && (
        <Link className="link" to="/forgot-password">
          Forgot your password?
        </Link>
      )}
      <button className="link" onClick={() => setRegister(!register)}>
        {register ? "Already have an account? Sign in" : "CREATE NEW ACCOUNT"}
      </button>
    </main>
  );
}
function ForgotPassword() {
  const [email, setEmail] = useState(""),
    [message, showMessage, clearMessage] = useAutoMessage();
  async function submit(e) {
    e.preventDefault();
    const r = await fetch(API + "/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    showMessage(d.message);
  }
  return (
    <main className="page auth">
      <h1>Reset your password</h1>
      <p>Enter your email and we will send a secure reset link.</p>
      <form onSubmit={submit}>
        <input
          required
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="darkbtn">Send reset link</button>
      </form>
      {message && <p>{message} <button type="button" className="link" onClick={clearMessage}>×</button></p>}
      <Link to="/login">Back to sign in</Link>
    </main>
  );
}
function ResetPassword() {
  const [password, setPassword] = useState(""),
    [message, showMessage, clearMessage] = useAutoMessage(),
    nav = useNavigate();
  async function submit(e) {
    e.preventDefault();
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return showMessage("This reset link is invalid.");
    const r = await fetch(API + "/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const d = await r.json();
    showMessage(d.message);
    if (r.ok) setTimeout(() => nav("/login"), 1500);
  }
  return (
    <main className="page auth">
      <h1>Choose a new password</h1>
      <form onSubmit={submit}>
        <input
          required
          minLength="8"
          type="password"
          placeholder="New password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="darkbtn">Update password</button>
      </form>
      {message && <p>{message} <button type="button" className="link" onClick={clearMessage}>×</button></p>}
    </main>
  );
}
function PaymentCallback() {
  const [message, setMessage] = useState("Verifying your payment securely...");
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get(
      "reference",
    );
    const token = localStorage.getItem("token");
    if (!reference || !token)
      return setMessage(
        "We could not verify this payment. Please sign in and check your orders.",
      );
    fetch(API + "/payments/" + encodeURIComponent(reference) + "/verify", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(async (r) => {
        const d = await r.json();
        setMessage(
          r.ok && d.paid
            ? `Payment confirmed. Your order #${d.orderId} is now paid.`
            : "Payment is still pending. Please check your order again shortly.",
        );
      })
      .catch(() =>
        setMessage(
          "We could not verify this payment right now. Please check your orders shortly.",
        ),
      );
  }, []);
  return (
    <main className="page auth">
      <h1>Payment status</h1>
      <p>{message}</p>
      <Link to="/account">View my orders</Link>
    </main>
  );
}
function LegacyAccount() {
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t)
      fetch(API + "/orders", { headers: { Authorization: "Bearer " + t } })
        .then((r) => (r.ok ? r.json() : []))
        .then(setOrders);
  }, []);
  return (
    <main className="page">
      <h1>Your account</h1>
      <h2>Order history</h2>
      {orders.length ? (
        orders.map((o) => (
          <p key={o.id}>
            Order #{o.id} | {o.status} | {money(o.total)}
          </p>
        ))
      ) : (
        <p>No orders yet.</p>
      )}
      <Link to="/shop">Continue shopping -&gt;</Link>
    </main>
  );
}
function Contact() {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [body, setBody] = useState(""),
    [message, showMessage, clearMessage] = useAutoMessage();
  const settings = useStore();
  async function submit(e) {
    e.preventDefault();
    const r = await fetch(API + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, body }),
    });
    showMessage(
      r.ok
        ? "Thank you. Your message has been sent successfully."
        : (await r.json()).message,
    );
    if (r.ok) {
      setName("");
      setEmail("");
      setBody("");
    }
  }
  return (
    <main className="page contact-page">
      <p className="eyebrow">LET'S CONNECT</p>
      <h1>We are here to help.</h1>
      <p>
        Have a question about an item, delivery, or your order? Send us a
        message and our team will get back to you as soon as possible.
      </p>
      <div className="contact-grid">
        <div className="contact-card">
          <h3>Reach LinaStyledYou</h3>
          <p>Email: {settings.contact_email}</p>
          <p>Phone: {settings.phone}</p>
          <a
            href={`https://wa.me/${cleanWhatsApp(settings.whatsapp_number)}?text=${encodeURIComponent(settings.whatsapp_message || "Hello!")}`}
            target="_blank"
            rel="noreferrer"
          >
            Chat on WhatsApp
          </a>
        </div>
        <form className="contact" onSubmit={submit}>
          <input
            required
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            required
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <textarea
            required
            placeholder="Tell us how we can help you."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="darkbtn">Send message</button>
        </form>
      </div>
      {message && <p>{message} <button type="button" className="link" onClick={clearMessage}>×</button></p>}
    </main>
  );
}
function ProductManager({ headers, products, setProducts }) {
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const empty = {
    name: "",
    categoryId: "",
    description: "",
    price: "",
    discountPrice: "",
    stock: "",
    sku: "",
    brand: "",
    image: "",
    sizes: "",
  };
  const [form, setForm] = useState(empty);
  useEffect(() => {
    fetch(API + "/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);
  function change(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }
  async function uploadImage(event) {
    const file = event.target.files?.[0];
    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
      preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!file) return;
    if (!cloud || !preset)
      return alert(
        "Image upload is not configured on this deployed site. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET, then redeploy.",
      );
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("upload_preset", preset);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
        { method: "POST", body: data },
      );
      const result = await response.json();
      if (!response.ok)
        return alert(result.error?.message || "Image upload failed");
      setForm({ ...form, image: result.secure_url });
    } catch {
      alert(
        "Image upload failed. Check your connection and Cloudinary upload preset.",
      );
    }
  }
  async function submit(event) {
    event.preventDefault();
    const sizes = form.sizes
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, stock: Number(form.stock) || 0 }));
    const body = {
      name: form.name,
      categoryId: Number(form.categoryId),
      description: form.description,
      price: Number(form.price),
      discountPrice: form.discountPrice ? Number(form.discountPrice) : null,
      stock: Number(form.stock),
      sku: form.sku,
      brand: form.brand || undefined,
      image: form.image || undefined,
      sizes,
    };
    const response = await fetch(
      editing ? API + "/admin/products/" + editing : API + "/admin/products",
      {
        method: editing ? "PATCH" : "POST",
        headers,
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return alert(error.message || "Product could not be saved.");
    }
    const saved = await response.json();
    setProducts((items) =>
      editing
        ? items.map((item) =>
            item.id === saved.id ? { ...item, ...saved } : item,
          )
        : [saved, ...items],
    );
    setForm(empty);
    setEditing(null);
  }
  function edit(product) {
    setEditing(product.id);
    setForm({
      ...empty,
      name: product.name,
      categoryId: product.category_id,
      description: product.description || "",
      price: product.price,
      discountPrice: product.discount_price || "",
      stock: product.stock,
      sku: product.sku,
      brand: product.brand || "",
      image: product.image || "",
    });
  }
  async function soldOut(product) {
    const response = await fetch(API + "/admin/products/" + product.id, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ stock: 0 }),
    });
    if (response.ok) {
      const saved = await response.json();
      setProducts((items) =>
        items.map((item) =>
          item.id === product.id ? { ...item, ...saved } : item,
        ),
      );
    }
  }
  async function remove(product) {
    if (!window.confirm("Remove this product from the storefront?")) return;
    const response = await fetch(API + "/admin/products/" + product.id, {
      method: "DELETE",
      headers,
    });
    if (response.ok)
      setProducts((items) =>
        items.map((item) =>
          item.id === product.id ? { ...item, active: false } : item,
        ),
      );
  }
  return (
    <div className="product-manager">
      <form className="product-form" onSubmit={submit}>
        <h2>{editing ? "Edit product" : "Add a new product"}</h2>
        <div className="field-grid">
          <label>
            Product name
            <input name="name" required value={form.name} onChange={change} />
          </label>
          <label>
            Category
            <select
              name="categoryId"
              required
              value={form.categoryId}
              onChange={change}
            >
              <option value="">Choose category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Price
            <input
              name="price"
              required
              type="number"
              min="0"
              value={form.price}
              onChange={change}
            />
          </label>
          <label>
            Sale price
            <input
              name="discountPrice"
              type="number"
              min="0"
              value={form.discountPrice}
              onChange={change}
            />
          </label>
          <label>
            Stock
            <input
              name="stock"
              required
              type="number"
              min="0"
              value={form.stock}
              onChange={change}
            />
          </label>
          <label>
            SKU
            <input name="sku" required value={form.sku} onChange={change} />
          </label>
          <label>
            Brand
            <input name="brand" value={form.brand} onChange={change} />
          </label>
          <label>
            Image URL
            <input
              name="image"
              type="url"
              value={form.image}
              onChange={change}
            />
          </label>
          <label>
            Or upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={uploadImage}
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={change}
          />
        </label>
        <label>
          Sizes, separated by commas
          <input
            name="sizes"
            placeholder="Small, Medium, Large"
            value={form.sizes}
            onChange={change}
          />
        </label>
        <button className="darkbtn" type="submit">
          {editing ? "Save changes" : "Add product"}
        </button>
        {editing && (
          <button
            className="link"
            type="button"
            onClick={() => {
              setEditing(null);
              setForm(empty);
            }}
          >
            Cancel
          </button>
        )}
      </form>
      <div className="admin-list">
        {products.map((product) => (
          <div key={product.id} className="list-row">
            <span>
              <b>{product.name}</b>
              <small>
                {product.category_name} - {product.stock} in stock{" "}
                {product.stock === 0
                  ? "- SOLD OUT"
                  : product.active
                    ? ""
                    : "- removed"}
              </small>
            </span>
            <div className="row-actions">
              <button onClick={() => edit(product)}>Edit</button>
              <button onClick={() => soldOut(product)}>Mark sold out</button>
              <button onClick={() => remove(product)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Admin() {
  const [d, setD] = useState(),
    [products, setProducts] = useState([]),
    [orders, setOrders] = useState([]),
    [customers, setCustomers] = useState([]),
    [staff, setStaff] = useState([]),
    [staffForm, setStaffForm] = useState({ name: "", email: "", password: "", role: "admin" }),
    [staffMessage, setStaffMessage] = useState(""),
    [paymentConfirmations, setPaymentConfirmations] = useState([]),
    [messages, setMessages] = useState([]),
    [selectedCustomer, setSelectedCustomer] = useState(null),
    [customerOrders, setCustomerOrders] = useState([]),
    [error, setError] = useState(""),
    [view, setView] = useState("dashboard"),
    [settingsForm, setSettingsForm] = useState(defaultSettings);
  const headers = {
    Authorization: "Bearer " + localStorage.getItem("token"),
    "Content-Type": "application/json",
  };
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError(
        "Please sign in with the owner account to open the admin dashboard.",
      );
      return;
    }
    Promise.all([
      fetch(API + "/admin/dashboard", { headers }),
      fetch(API + "/admin/products/manage", { headers }),
      fetch(API + "/admin/orders", { headers }),
      fetch(API + "/admin/customers", { headers }),
      fetch(API + "/admin/staff", { headers }),
      fetch(API + "/admin/payment-confirmations", { headers }),
      fetch(API + "/messages", { headers }),
    ])
      .then(async ([a, b, c, x, team, confirmations, inbox]) => {
        if (!a.ok || !b.ok || !c.ok || !x.ok)
          throw Error(
            "Admin access required. Sign in with the owner account first.",
          );
        setD(await a.json());
        setProducts(await b.json());
        setOrders(await c.json());
        setCustomers(await x.json());
        setStaff(team.ok ? await team.json() : []);
        setPaymentConfirmations(
          confirmations.ok ? await confirmations.json() : [],
        );
        setMessages(inbox.ok ? await inbox.json() : []);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function reviewPayment(id, status) {
    const response = await fetch(API + "/admin/payment-confirmations/" + id, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      const updated = await response.json();
      setPaymentConfirmations((items) =>
        items.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      setOrders((items) =>
        items.map((item) =>
          item.id === updated.order_id && status === "approved"
            ? { ...item, status: "paid", payment_status: "paid" }
            : item,
        ),
      );
    }
  }
  async function showCustomerOrders(customer) {
    setSelectedCustomer(customer);
    const response = await fetch(API + "/admin/customers/" + customer.id + "/orders", { headers });
    setCustomerOrders(response.ok ? await response.json() : []);
  }
  async function addStaff(event) {
    event.preventDefault();
    const response = await fetch(API + "/admin/staff", { method: "POST", headers, body: JSON.stringify(staffForm) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setStaffMessage(data.message || "Staff account could not be created.");
    setStaff((items) => [...items, data]);
    setStaffForm({ name: "", email: "", password: "", role: "admin" });
    setStaffMessage("Staff account created.");
  }
  async function removeStaff(id) {
    if (!window.confirm("Remove this admin account?")) return;
    const response = await fetch(API + "/admin/staff/" + id, { method: "DELETE", headers });
    if (response.ok) setStaff((items) => items.filter((item) => item.id !== id));
    else { const data = await response.json().catch(() => ({})); setStaffMessage(data.message || "Staff account could not be removed."); }
  }
  useEffect(() => {
    if (view === "settings") {
      fetch(API + "/admin/settings", { headers })
        .then((r) => (r.ok ? r.json() : Promise.resolve(defaultSettings)))
        .then(setSettingsForm)
        .catch(() => setSettingsForm(defaultSettings));
    }
  }, [view]);
  async function toggle(p) {
    const r = await fetch(API + "/admin/products/" + p.id, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ active: !p.active }),
    });
    if (r.ok) {
      const updated = await r.json();
      setProducts((x) => x.map((i) => (i.id === p.id ? updated : i)));
    }
  }
  async function saveSettings(e) {
    e.preventDefault();
    const r = await fetch(API + "/admin/settings", {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(settingsForm),
    });
    const data = await r.json();
    if (r.ok) {
      setSettingsForm(data);
      setError("");
      alert("Store settings saved successfully.");
    } else {
      setError(data.message || "Unable to save store settings.");
    }
  }
  if (error)
    return (
      <main className="page">
        <h1>Admin</h1>
        <p>{error}</p>
      </main>
    );
  if (!d) return <main className="page">Loading admin dashboard...</main>;
  return (
    <main className="page admin-shell">
      <aside className="admin-sidebar">
        <div className="logo">LinaStyledYou</div>
        <label className="admin-view-select">
          <span>Open section</span>
          <select value={view} onChange={(event) => setView(event.target.value)}>
            <option value="dashboard">Dashboard</option>
            <option value="catalog">Catalog</option>
            <option value="orders">Orders</option>
            <option value="payments">Payment confirmations</option>
            <option value="customers">Customers</option>
            <option value="staff">Staff</option>
            <option value="messages">Messages</option>
            <option value="settings">Store settings</option>
          </select>
        </label>
        <nav className="admin-nav">
          <button
            className={view === "dashboard" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={view === "catalog" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("catalog")}
          >
            Catalog
          </button>
          <button
            className={view === "orders" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("orders")}
          >
            Orders
          </button>
          <button
            className={view === "payments" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("payments")}
          >
            Payment confirmations{" "}
            {paymentConfirmations.filter((item) => item.status === "pending")
              .length
              ? "(" +
                paymentConfirmations.filter((item) => item.status === "pending")
                  .length +
                ")"
              : ""}
          </button>
          <button
            className={view === "customers" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("customers")}
          >
            Customers
          </button>
          <button className={view === "staff" ? "nav-btn active" : "nav-btn"} onClick={() => setView("staff")}>Staff</button>
          <button
            className={view === "messages" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("messages")}
          >
            Messages {messages.filter((item) => !item.read).length ? "(" + messages.filter((item) => !item.read).length + ")" : ""}
          </button>
          <button
            className={view === "settings" ? "nav-btn active" : "nav-btn"}
            onClick={() => setView("settings")}
          >
            Store settings
          </button>
        </nav>
        <div className="sidebar-card">
          <small>WhatsApp</small>
          <strong>{settingsForm.whatsapp_number || "No number saved"}</strong>
          <a
            href={`https://wa.me/${cleanWhatsApp(settingsForm.whatsapp_number)}?text=${encodeURIComponent(settingsForm.whatsapp_message || "Hello!")}`}
            target="_blank"
            rel="noreferrer"
          >
            Chat now
          </a>
          <button
            className="link admin-logout"
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <section className="admin-main">
        {view === "dashboard" && (
          <>
            <p className="eyebrow">OWNER DASHBOARD</p>
            <h1>Store overview</h1>
            <div className="metrics">
              <div className="stat-card">
                <small>Total sales</small>
                <b>{compactMoney(d.sales)}</b>
              </div>
              <div className="stat-card">
                <small>Orders</small>
                <b>{d.orders.total}</b>
              </div>
              <div className="stat-card">
                <small>Customers</small>
                <b>{d.customers}</b>
              </div>
              <div className="stat-card">
                <small>Products</small>
                <b>{d.products}</b>
              </div>
            </div>
            <div className="admin-panels">
              <div className="panel">
                <h3>Low stock</h3>
                {d.lowStock.length ? (
                  d.lowStock.map((p) => (
                    <div key={p.id} className="list-row">
                      <span>{p.name}</span>
                      <strong>{p.stock} left</strong>
                    </div>
                  ))
                ) : (
                  <p>Everything is comfortably stocked.</p>
                )}
              </div>
              <div className="panel">
                <h3>Recent orders</h3>
                {d.recentOrders.length ? (
                  d.recentOrders.map((o) => (
                    <div key={o.id} className="list-row">
                      <span>Order #{o.id}</span>
                      <strong>{o.status}</strong>
                    </div>
                  ))
                ) : (
                  <p>No recent orders.</p>
                )}
              </div>
            </div>
          </>
        )}
        {view === "catalog" && (
          <>
            <p className="eyebrow">CATALOG</p>
            <h1>Inventory</h1>
            <ProductManager
              headers={headers}
              products={products}
              setProducts={setProducts}
            />
          </>
        )}
        {view === "orders" && (
          <>
            <p className="eyebrow">ORDERS</p>
            <h1>Order management</h1>
            <div className="admin-list">
              {orders.map((o) => (
                <div key={o.id} className="list-row">
                  <span>
                    <b>Order #{o.id}</b>
                    <small>
                      {o.status} | {o.payment_status}
                    </small>
                  </span>
                  <strong>{money(o.total)}</strong>
                </div>
              ))}
            </div>
          </>
        )}
        {view === "payments" && (
          <>
            <p className="eyebrow">PAYMENT CONFIRMATIONS</p>
            <h1>Bank-transfer payments</h1>
            <div className="admin-list">
              {paymentConfirmations.length ? (
                paymentConfirmations.map((payment) => (
                  <div key={payment.id} className="list-row">
                    <span>
                      <b>
                        Order #{payment.order_id} - {payment.payer_name}
                      </b>
                      <small>
                        {payment.customer_name} ({payment.email}) | Paid:{" "}
                        {money(payment.amount)} | Ref:{" "}
                        {payment.reference || "none"} | {payment.status}
                      </small>
                    </span>
                    {payment.status === "pending" && (
                      <div className="row-actions">
                        <button
                          onClick={() => reviewPayment(payment.id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => reviewPayment(payment.id, "rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p>No payment confirmations yet.</p>
              )}
            </div>
          </>
        )}
        {view === "customers" && (
          <>
            <p className="eyebrow">CUSTOMERS</p>
            <h1>Customer insights</h1>
            <div className="admin-list">
              {customers.map((c) => (
                <div key={c.id} className="list-row">
                  <button className="customer-row" onClick={() => showCustomerOrders(c)}>
                    <b>{c.name}</b>
                    <small>{c.email}</small>
                  </button>
                  <strong>{c.orders} orders</strong>
                </div>
              ))}
            </div>
            {selectedCustomer && <section className="customer-orders panel"><div className="sectionhead"><h2>{selectedCustomer.name}'s orders</h2><button className="link" onClick={() => setSelectedCustomer(null)}>Close</button></div>{customerOrders.length ? customerOrders.map((order) => <div className="list-row" key={order.id}><span><b>Order #{order.id}</b><small>{order.status} | {order.payment_status}</small></span><strong>{money(order.total)}</strong></div>) : <p>No orders found.</p>}</section>}
          </>
        )}
        {view === "staff" && (
          <>
            <p className="eyebrow">TEAM ACCESS</p>
            <h1>Admins and owner</h1>
            <form className="contact staff-form" onSubmit={addStaff}>
              <input required minLength="2" placeholder="Name" value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} />
              <input required type="email" placeholder="Email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} />
              <input required minLength="8" type="password" placeholder="Temporary password" value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} />
              <select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}><option value="admin">Admin</option><option value="owner">Owner</option></select>
              <button className="darkbtn">Add staff account</button>
              {staffMessage && <p>{staffMessage}</p>}
            </form>
            <div className="admin-list">{staff.map((member) => <div className="list-row" key={member.id}><span><b>{member.name}</b><small>{member.email} | {member.role}</small></span>{member.role === "admin" && <button onClick={() => removeStaff(member.id)}>Remove</button>}</div>)}</div>
          </>
        )}
        {view === "messages" && (
          <>
            <p className="eyebrow">INBOX</p>
            <h1>Customer messages</h1>
            <div className="admin-list">
              {messages.length ? messages.map((item) => (
                <article className="message-item" key={item.id}>
                  <div className="sectionhead"><strong>{item.name}</strong><small>{item.email} | {new Date(item.created_at).toLocaleString()}</small></div>
                  <p>{item.body}</p>
                </article>
              )) : <p>No customer messages yet.</p>}
            </div>
          </>
        )}
        {view === "settings" && (
          <>
            <p className="eyebrow">STORE SETTINGS</p>
            <h1>Brand & contact</h1>
            <form className="settings-form" onSubmit={saveSettings}>
              <div className="field-grid">
                <label>
                  Store name
                  <input
                    value={settingsForm.store_name || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        store_name: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Tagline
                  <textarea
                    value={settingsForm.tag_line || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        tag_line: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Contact email
                  <input
                    type="email"
                    value={settingsForm.contact_email || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        contact_email: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={settingsForm.phone || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        phone: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  WhatsApp number
                  <input
                    value={settingsForm.whatsapp_number || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        whatsapp_number: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Instagram URL
                  <input
                    value={settingsForm.instagram_url || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        instagram_url: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  TikTok URL
                  <input
                    value={settingsForm.tiktok_url || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        tiktok_url: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Currency
                  <input
                    value={settingsForm.currency || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        currency: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Shipping banner
                  <textarea
                    value={settingsForm.shipping_message || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        shipping_message: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  WhatsApp greeting
                  <textarea
                    value={settingsForm.whatsapp_message || ""}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        whatsapp_message: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <button className="darkbtn" type="submit">
                Save settings
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
function Footer() {
  const settings = useStore();
  return (
    <footer>
      <div className="logo">{settings.store_name || "LinaStyledYou"}</div>
      <p>{settings.tag_line || "Curated beauty, wherever you are."}</p>
      <div className="footer-links">
        <a
          href={settings.instagram_url || "#"}
          target="_blank"
          rel="noreferrer"
        >
          Instagram
        </a>
        <a href={settings.tiktok_url || "#"} target="_blank" rel="noreferrer">
          TikTok
        </a>
        <a
          href={`https://wa.me/${cleanWhatsApp(settings.whatsapp_number)}?text=${encodeURIComponent(settings.whatsapp_message || "Hello!")}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
      </div>
    </footer>
  );
}
function App() {
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("store-cart") || "[]"); }
    catch { return []; }
  });
  const [settings, setSettings] = useState(defaultSettings);
  useEffect(() => { localStorage.setItem("store-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const headers = { Authorization: "Bearer " + token };
    fetch(API + "/cart", { headers })
      .then((response) => response.ok ? response.json() : [])
      .then((items) => setCart(items.map((item) => ({ ...item, id: item.product_id, cartItemId: item.id }))))
      .catch(() => {});
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
      clear: () => {
        setCart([]);
        const headers = authHeaders();
        if (headers) fetch(API + "/cart", { method: "DELETE", headers }).catch(() => {});
      },
      add: (p) => {
        const headers = authHeaders();
        if (headers) {
          fetch(API + "/cart/items", { method: "POST", headers, body: JSON.stringify({ productId: p.id, quantity: 1, variantId: p.variantId || null }) })
            .then(() => fetch(API + "/cart", { headers }))
            .then((response) => response.ok ? response.json() : [])
            .then((items) => setCart(items.map((item) => ({ ...item, id: item.product_id, cartItemId: item.id }))));
          return;
        }
        setCart((c) => {
          let x = c.find((i) => i.id === p.id);
          return x
            ? c.map((i) =>
                i.id === p.id
                  ? { ...i, quantity: Math.min(i.quantity + 1, p.stock) }
                  : i,
              )
            : [...c, { ...p, quantity: 1 }];
        });
      },
      remove: (id) => {
        setCart((c) => {
          const item = c.find((entry) => entry.id === id);
          const headers = authHeaders();
          if (headers && item?.cartItemId) fetch(API + "/cart/items/" + item.cartItemId, { method: "DELETE", headers }).catch(() => {});
          return c.filter((i) => i.id !== id);
        });
      },
      change: (id, d) => {
        setCart((c) => {
          const item = c.find((entry) => entry.id === id);
          const quantity = item ? Math.max(1, Math.min(item.stock, item.quantity + d)) : 1;
          const headers = authHeaders();
          if (headers && item?.cartItemId) fetch(API + "/cart/items/" + item.cartItemId, { method: "PUT", headers, body: JSON.stringify({ quantity }) }).catch(() => {});
          return c.map((entry) => entry.id === id ? { ...entry, quantity } : entry);
        });
      },
    }),
    [cart],
  );
  return (
    <Store.Provider value={settings}>
      <Cart.Provider value={value}>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/payment/callback" element={<PaymentCallback />} />
          <Route path="/account" element={<AccountDetails />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
        <Footer />
      </Cart.Provider>
    </Store.Provider>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
