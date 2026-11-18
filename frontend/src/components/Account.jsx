import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, money } from "../shared.jsx";

export function AccountDetails() {
  const [user, setUser] = useState(),
    [orders, setOrders] = useState([]),
    [displayName, setDisplayName] = useState(""),
    [nameMessage, setNameMessage] = useState(""),
    [accountError, setAccountError] = useState(""),
    [activeTab, setActiveTab] = useState("orders"),
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
        setDisplayName(userData.user.name || "");
        setOrders(o.ok ? await o.json() : []);
      })
      .catch(() => setAccountError("We could not connect to your account. Please start the store API and try again."));
  }, [nav]);

  async function saveDisplayName(event) {
    event.preventDefault();
    const response = await fetch(API + "/auth/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token"),
      },
      body: JSON.stringify({ name: displayName }),
    });
    const data = await response.json();
    if (response.ok) {
      setUser(data.user);
      setDisplayName(data.user.name);
      setNameMessage("Profile name updated successfully.");
    } else {
      setNameMessage(data.message || "Could not update your name.");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("store-cart");
    setCart([]);
    window.dispatchEvent(new Event("store-auth-changed"));
    nav("/login");
  }

  async function cancelOrder(orderId) {
    if (!window.confirm("Are you sure you want to cancel this unpaid order?")) return;
    const response = await fetch(API + "/orders/" + orderId + "/cancel", {
      method: "PATCH",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
    });
    const data = await response.json();
    if (response.ok) {
      setOrders((items) =>
        items.map((order) =>
          order.id === orderId ? { ...order, status: "cancelled" } : order,
        ),
      );
    } else {
      alert(data.message || "This order cannot be cancelled.");
    }
  }

  if (accountError) {
    return (
      <main className="page account-page">
        <div className="account-empty-card">
          <h1>Account unavailable</h1>
          <p>{accountError}</p>
          <button className="darkbtn" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page account-page">
        <div className="account-loading-card">
          <p>Loading your boutique account...</p>
        </div>
      </main>
    );
  }

  const roleBadge = user.role === "owner" ? "Store Owner" : user.role === "admin" ? "Admin" : "Customer";

  return (
    <main className="page account-page">
      {/* Account Top Banner */}
      <div className="account-hero-bar">
        <div className="account-avatar-summary">
          <div className="account-avatar-circle">
            {user.name ? user.name.charAt(0).toUpperCase() : "U"}
          </div>
          <div>
            <div className="account-eyebrow-line">
              <span className="eyebrow">CLIENT SUITE</span>
              <span className="account-role-badge">{roleBadge}</span>
            </div>
            <h1>Welcome back, {user.name}</h1>
            <p className="account-email-sub">{user.email}</p>
          </div>
        </div>
        <div className="account-actions-bar">
          {['admin', 'owner'].includes(user.role) && (
            <Link className="secondary-btn admin-btn" to="/admin">
              Store Dashboard →
            </Link>
          )}
          <button className="account-logout-btn" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Account Navigation Tabs */}
      <div className="account-nav-tabs">
        <button
          className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          My Orders ({orders.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Profile Details
        </button>
      </div>

      {/* Tab 1: Orders */}
      {activeTab === "orders" && (
        <section className="account-section">
          {orders.length ? (
            <div className="orders-grid">
              {orders.map((o) => (
                <div className="order-modern-card" key={o.id}>
                  <div className="order-card-header">
                    <div>
                      <span className="order-number">Order #{o.id}</span>
                      <small className="order-date">
                        {o.created_at ? new Date(o.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : "Recent"}
                      </small>
                    </div>
                    <span className={`status-pill status-${o.status}`}>
                      {o.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="order-card-body">
                    <div className="order-meta-item">
                      <span>Total Amount:</span>
                      <strong>{money(o.total)}</strong>
                    </div>
                    <div className="order-meta-item">
                      <span>Payment Status:</span>
                      <span className="payment-status-label">{o.payment_status || "Pending"}</span>
                    </div>
                  </div>

                  <div className="order-card-footer">
                    {o.status === "pending_payment" && o.payment_status === "pending" && (
                      <button className="cancel-order-btn" onClick={() => cancelOrder(o.id)}>
                        Cancel Unpaid Order
                      </button>
                    )}
                    <Link className="reorder-link" to="/shop">
                      Shop Again →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="account-empty-card">
              <span className="empty-icon">🛍</span>
              <h3>No purchases yet</h3>
              <p>Your order history will appear here once you make your first beauty purchase.</p>
              <Link className="darkbtn" to="/shop">
                Explore The Shop →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Profile Settings */}
      {activeTab === "profile" && (
        <section className="account-section">
          <div className="profile-edit-card">
            <h3>Personal Information</h3>
            <p className="profile-edit-desc">Manage how your name displays across your orders and receipts.</p>

            {nameMessage && (
              <div className="account-alert" role="alert">
                <span>{nameMessage}</span>
                <button type="button" className="close-btn" onClick={() => setNameMessage("")}>×</button>
              </div>
            )}

            <form className="modern-profile-form" onSubmit={saveDisplayName}>
              <div className="form-field">
                <label htmlFor="account-display-name">Display Name</label>
                <input
                  id="account-display-name"
                  required
                  minLength="2"
                  maxLength="100"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your Name"
                />
              </div>

              <div className="form-field">
                <label>Registered Email Address</label>
                <input disabled value={user.email} />
                <small className="field-hint">Email is linked to your customer ID and cannot be changed.</small>
              </div>

              <div className="form-field">
                <label>Membership Role</label>
                <input disabled value={roleBadge} />
              </div>

              <button className="darkbtn profile-save-btn">
                Update Profile
              </button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}

export function LegacyAccount() {
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
