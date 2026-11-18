import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API, cleanWhatsApp, useCart, useStore } from "../shared.jsx";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-part brand-lina">Lina</span>
      <span className="brand-part brand-styled">Styled</span>
      <span className="brand-part brand-you">You</span>
    </span>
  );
}
export function Header() {
  const { cart, clear } = useCart();
  const settings = useStore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const nav = useNavigate();
  const wa = cleanWhatsApp(settings.whatsapp_number);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    localStorage.removeItem("store-cart");
    clear();
    setIsLoggedIn(false);
    setIsAdmin(false);
    window.dispatchEvent(new Event("store-auth-changed"));
    nav("/login");
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const cartCount = cart.reduce((n, x) => n + x.quantity, 0);

  return (
    <div className={`header-wrapper ${scrolled ? "scrolled" : ""}`}>
      <div className="notice">
        {settings.shipping_message || "We ship worldwide"} | Secure checkout | Made for your glow
      </div>
      <header className={`navbar ${scrolled ? "scrolled" : ""}`}>
        <Link className="logo" to="/">
          <img
            className="brand-image"
            src={settings.logo_url || "/lina-styled-you-logo.jpeg"}
            alt="LinaStyledYou"
          />
        </Link>
        <button
          className={`menu-toggle ${menuOpen ? "open" : ""}`}
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
            <span>Cart</span>
            {cartCount > 0 && <b>{cartCount}</b>}
          </Link>
        </nav>
      </header>
    </div>
  );
}

export function Footer() {
  const settings = useStore();
  const year = new Date().getFullYear();
  const wa = cleanWhatsApp(settings.whatsapp_number);

  return (
    <footer className="store-footer">
      <div className="footer-top">
        <div className="footer-col brand-col">
          <Link className="logo" to="/">
            <Brand />
          </Link>
          <p className="footer-tagline">
            {settings.tag_line || "Curated beauty, delivered worldwide. Made for your glow."}
          </p>
          <div className="footer-socials">
            {settings.instagram_url && (
              <a
                href={settings.instagram_url}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="social-btn"
              >
                Instagram
              </a>
            )}
            {settings.tiktok_url && (
              <a
                href={settings.tiktok_url}
                target="_blank"
                rel="noreferrer"
                aria-label="TikTok"
                className="social-btn"
              >
                TikTok
              </a>
            )}
            {wa && (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(
                  settings.whatsapp_message || "Hello! I would like to inquire about your store."
                )}`}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="social-btn whatsapp-social"
              >
                WhatsApp Chat
              </a>
            )}
          </div>
        </div>

        <div className="footer-col">
          <h4>Explore</h4>
          <ul className="footer-nav">
            <li><Link to="/shop">Shop Collection</Link></li>
            <li><Link to="/cart">My Bag</Link></li>
            <li><Link to="/account">Track Orders</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Client Care</h4>
          <ul className="footer-nav">
            <li><Link to="/contact">Contact Support</Link></li>
            <li><Link to="/account">My Account</Link></li>
            <li>
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(
                  "Hello! I have a question about my order."
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Order Assistance
              </a>
            </li>
          </ul>
        </div>

        <div className="footer-col promise-col">
          <h4>The Experience</h4>
          <p className="footer-promise">
            {settings.shipping_message || "Worldwide luxury shipping & secure door-to-door delivery."}
          </p>
          <div className="payment-badges">
            <span className="pay-badge">✓ Secure Checkout</span>
            <span className="pay-badge">✓ Authentic Beauty</span>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {year} {settings.store_name || "LinaStyledYou"}. All rights reserved.</p>
        <div className="footer-legal">
          <span>Made for your glow</span>
        </div>
      </div>
    </footer>
  );
}
