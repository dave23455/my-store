import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API, cleanWhatsApp, money, useAutoMessage, useCart, useStore } from "../shared.jsx";

export function ProductCard({ p }) {
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
export function Home() {
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
        <div className="hero-content">
          <p className="hero-eyebrow">YOUR EVERYDAY LUXURY</p>
          <h1>
            Beauty that
            <br />
            <em>moves with you.</em>
          </h1>
          <p className="lead">
            {settings.tag_line || "Premium beauty, delivered worldwide."}
          </p>
          <div className="hero-actions">
            <Link className="darkbtn hero-btn" to="/shop">
              Shop new arrivals <span>→</span>
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orb">
            <img
              src={settings.logo_url || "/lina-styled-you-logo.jpeg"}
              alt="LinaStyledYou logo"
            />
          </div>
        </div>
      </section>
      {/* Trust & Value Bar */}
      <section className="value-bar">
        <div className="value-item">
          <span className="value-icon">✨</span>
          <div>
            <strong>100% Authentic Quality</strong>
            <small>Handpicked luxury beauty</small>
          </div>
        </div>
        <div className="value-item">
          <span className="value-icon">📦</span>
          <div>
            <strong>Worldwide Delivery</strong>
            <small>Fast, insured shipping</small>
          </div>
        </div>
        <div className="value-item">
          <span className="value-icon">🔒</span>
          <div>
            <strong>Secure Payments</strong>
            <small>Protected online checkout</small>
          </div>
        </div>
        <div className="value-item">
          <span className="value-icon">💬</span>
          <div>
            <strong>Dedicated Concierge</strong>
            <small>Direct WhatsApp support</small>
          </div>
        </div>
      </section>

      <section className="intro">
        <p className="eyebrow">ONE STORE. A WORLD OF POSSIBILITY.</p>
        <h2>
          {settings.tag_line || "Curated pieces for your most confident self."}
        </h2>
        <div className="intro-divider">
          <span className="divider-line" />
          <span className="divider-sparkle">✦</span>
          <span className="divider-line" />
        </div>
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

      {/* Brand Experience & Delivery Showcase */}
      <section className="shipping-banner">
        <div className="shipping-inner">
          <div className="shipping-badge">EXCLUSIVE EXPERIENCE</div>
          <h2>{settings.shipping_message || "Worldwide luxury delivery"}</h2>
          <p>
            Wherever your next chapter takes you, we ensure every curated piece arrives securely and impeccably packaged.
          </p>
          <div className="shipping-actions">
            <Link className="darkbtn" to="/shop">
              Explore the collection <span>→</span>
            </Link>
            <Link className="secondary-btn" to="/contact">
              Ask a question
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
export function Shop() {
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
export function Product() {
  const { id } = useParams(),
    [p, setP] = useState(),
    [selectedImage, setSelectedImage] = useState(""),
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
    setSelectedImage("");
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
  const chosen = p.variants?.find((v) => v.id === choice);
  const item = {
    ...p,
    price: chosen?.price || p.price,
    stock: chosen?.stock ?? p.stock,
    variantId: chosen?.id,
  };
  const images = (p.images || [])
    .map((image) => (typeof image === "string" ? image : image.url))
    .filter(Boolean);
  return (
    <>
      <main className="product">
        <Link className="back-link" to="/shop">
          <span aria-hidden="true">←</span> Back to shop
        </Link>
        <div className="product-gallery">
          <img
            className="product-gallery-main"
            src={selectedImage || images[0] || p.image || "/lina-styled-you-logo.jpeg"}
            alt={p.name}
          />
          {images.length > 1 && (
            <div className="product-gallery-thumbnails" aria-label="Product images">
              {images.map((image, index) => (
                <button
                  type="button"
                  className={image === (selectedImage || images[0]) ? "active" : ""}
                  key={`${image}-${index}`}
                  onClick={() => setSelectedImage(image)}
                  aria-label={`View product image ${index + 1}`}
                  aria-pressed={image === (selectedImage || images[0])}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="eyebrow">{p.category_name}</p>
          <h1>{p.name}</h1>
          <p className="stars">
            ★★★★★ <span>{Number(p.rating || 0).toFixed(1)}</span>
          </p>
          <h2>{money(p.discount_price || item.price)}</h2>
          <p>{p.description}</p>
          {p.size_guide && (
            <details className="product-size-guide">
              <summary>Size guide</summary>
              <p>{p.size_guide}</p>
            </details>
          )}
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
                    {v.name}{Object.values(v.options).length ? ` — ${Object.values(v.options).join(" / ")}` : ""}
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

export function Contact() {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [body, setBody] = useState(""),
    [loading, setLoading] = useState(false),
    [message, showMessage, clearMessage] = useAutoMessage();
  const settings = useStore();
  const wa = cleanWhatsApp(settings.whatsapp_number);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(API + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, body }),
      });
      const data = await r.json().catch(() => ({}));
      showMessage(
        r.ok
          ? "Thank you. Your message has been sent successfully."
          : (data.message || "Could not send your message.")
      );
      if (r.ok) {
        setName("");
        setEmail("");
        setBody("");
      }
    } catch {
      showMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page contact-page">
      <div className="contact-hero">
        <p className="eyebrow">CLIENT CARE & CONCIERGE</p>
        <h1>Get in touch.</h1>
        <p className="lead">
          Have questions about a piece, sizing, custom orders, or delivery? We are here to assist with every detail.
        </p>
      </div>

      <div className="contact-layout">
        <aside className="contact-info-panel">
          <div className="contact-info-card">
            <span className="contact-pill-tag">DIRECT ASSISTANCE</span>
            <h3>LinaStyledYou Studio</h3>
            <p className="contact-intro">
              Reach our boutique team directly for fast styling guidance and order inquiries.
            </p>

            <div className="contact-methods">
              {settings.contact_email && (
                <div className="contact-method-item">
                  <span className="method-icon">✉</span>
                  <div>
                    <label>Email Support</label>
                    <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>
                  </div>
                </div>
              )}

              {settings.phone && (
                <div className="contact-method-item">
                  <span className="method-icon">☎</span>
                  <div>
                    <label>Phone</label>
                    <a href={`tel:${settings.phone}`}>{settings.phone}</a>
                  </div>
                </div>
              )}

              {wa && (
                <div className="contact-method-item">
                  <span className="method-icon">💬</span>
                  <div>
                    <label>Instant WhatsApp</label>
                    <a
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(
                        settings.whatsapp_message || "Hello! I would like to inquire about your store."
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Chat with us
                    </a>
                  </div>
                </div>
              )}
            </div>

            {wa && (
              <a
                className="whatsapp-action-btn"
                href={`https://wa.me/${wa}?text=${encodeURIComponent(
                  settings.whatsapp_message || "Hello! I would like to inquire about your store."
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Open WhatsApp Concierge <span>→</span>
              </a>
            )}
          </div>
        </aside>

        <section className="contact-form-panel">
          <div className="contact-form-card">
            <h3>Send us a message</h3>
            <p className="form-subtext">Fill out your details and we will reply within 24 business hours.</p>

            {message && (
              <div className="contact-alert" role="alert">
                <span>{message}</span>
                <button type="button" className="close-btn" onClick={clearMessage} aria-label="Close notification">×</button>
              </div>
            )}

            <form className="modern-contact-form" onSubmit={submit}>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="contact-name">Your Full Name</label>
                  <input
                    id="contact-name"
                    required
                    placeholder="e.g. Lina Adams"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="contact-email">Email Address</label>
                  <input
                    id="contact-email"
                    required
                    type="email"
                    placeholder="e.g. lina@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="contact-body">How can we help you?</label>
                <textarea
                  id="contact-body"
                  required
                  rows="5"
                  placeholder="Tell us about the item, question, or order..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <button className="darkbtn contact-submit-btn" disabled={loading}>
                {loading ? "Sending message..." : "Send Message →"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
