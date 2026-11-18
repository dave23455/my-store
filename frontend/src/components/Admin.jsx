import { useEffect, useState } from "react";
import { API, cleanWhatsApp, compactMoney, defaultSettings, money } from "../shared.jsx";

export function ProductManager({ headers, products, setProducts }) {
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPreviews, setUploadPreviews] = useState([]);
  const [msg, setMsg] = useState("");

  const empty = {
    name: "",
    categoryId: "",
    description: "",
    price: "",
    discountPrice: "",
    stock: "",
    sku: "",
    brand: "",
    images: [],
    sizeGuide: "",
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

  async function uploadImages(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
      preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!files.length) return;
    if (!cloud || !preset) {
      setMsg("Image uploads are not configured. Set the Cloudinary cloud name and unsigned upload preset in the frontend environment.");
      input.value = "";
      return;
    }
    if (form.images.length + files.length > 8) {
      setMsg("A product can have up to 8 images. Remove an image before adding more.");
      input.value = "";
      return;
    }
    const invalidFile = files.find(
      (file) =>
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
    );
    if (invalidFile) {
      setMsg(`${invalidFile.name} is not supported. Choose a PNG, JPEG, or WebP image up to 10 MB.`);
      input.value = "";
      return;
    }

    setUploading(true);
    const previews = files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setUploadPreviews(previews);
    let uploaded = 0;
    const failures = [];
    for (const file of files) {
      try {
        const data = new FormData();
        data.append("file", file);
        data.append("upload_preset", preset);
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
          { method: "POST", body: data }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const reason = result.error?.message || "Upload failed";
          if (/upload preset.*not found|preset not found/i.test(reason)) {
            throw new Error("Cloudinary cannot find this upload preset. Create an unsigned preset in the same Cloudinary account, then set VITE_CLOUDINARY_UPLOAD_PRESET in the frontend and redeploy.");
          }
          throw new Error(reason);
        }
        if (typeof result.secure_url !== "string") {
          throw new Error("The upload service did not return an image URL.");
        }
        setForm((previous) => ({
          ...previous,
          images: [...previous.images, result.secure_url],
        }));
        uploaded += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error.message || "Upload failed"}`);
      }
    }
    setUploading(false);
    previews.forEach(({ url }) => URL.revokeObjectURL(url));
    setUploadPreviews([]);
    input.value = "";
    setMsg(
      failures.length
        ? `${uploaded} image${uploaded === 1 ? "" : "s"} uploaded. ${failures.join(" ")}`
        : `${uploaded} image${uploaded === 1 ? "" : "s"} uploaded successfully.`
    );
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
      categoryId: form.categoryId,
      description: form.description,
      price: Number(form.price),
      discountPrice: form.discountPrice ? Number(form.discountPrice) : null,
      stock: Number(form.stock),
      sku: form.sku,
      brand: form.brand || undefined,
      image: form.images[0] || "",
      images: form.images,
      sizeGuide: form.sizeGuide,
      ...(!editing ? { sizes } : {}),
    };

    const response = await fetch(
      editing ? API + "/admin/products/" + editing : API + "/admin/products",
      {
        method: editing ? "PATCH" : "POST",
        headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      alert(error.message || "Product could not be saved.");
      return;
    }

    const saved = await response.json();
    setProducts((items) =>
      editing
        ? items.map((item) => (item.id === saved.id ? { ...item, ...saved } : item))
        : [saved, ...items]
    );
    setMsg(editing ? "Product updated." : "Product added to catalog.");
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
      images: (product.images || (product.image ? [product.image] : [])).map(
        (image) => (typeof image === "string" ? image : image.url)
      ),
      sizeGuide: product.size_guide || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        items.map((item) => (item.id === product.id ? { ...item, ...saved, stock: 0 } : item))
      );
      setMsg(`${product.name} marked as sold out.`);
    }
  }

  async function remove(product) {
    if (!window.confirm(`Remove "${product.name}" from the active catalog?`)) return;
    const response = await fetch(API + "/admin/products/" + product.id, {
      method: "DELETE",
      headers,
    });
    if (response.ok) {
      setProducts((items) =>
        items.map((item) => (item.id === product.id ? { ...item, active: false } : item))
      );
      setMsg(`${product.name} removed from catalog.`);
    }
  }

  const filteredProducts = products.filter((p) => {
    const matchesCat = filterCategory === "all" || String(p.category_id) === String(filterCategory);
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="modern-product-manager">
      {/* Product Form Card */}
      <div className="product-form-card">
        <div className="form-card-header">
          <div>
            <span className="eyebrow">{editing ? "PRODUCT EDITOR" : "NEW ADDITION"}</span>
            <h3>{editing ? `Editing: ${form.name || "Product"}` : "Add a New Boutique Product"}</h3>
          </div>
          {editing && (
            <button
              className="cancel-edit-btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              Cancel Edit
            </button>
          )}
        </div>

        {msg && (
          <div className="admin-status-toast">
            <span>{msg}</span>
            <button type="button" onClick={() => setMsg("")}>×</button>
          </div>
        )}

        <form className="admin-product-form" onSubmit={submit}>
          <div className="admin-form-grid">
            <div className="form-field full-width">
              <label>Product Title *</label>
              <input
                name="name"
                required
                placeholder="e.g. Brazilian Deep Wave Wig"
                value={form.name}
                onChange={change}
              />
            </div>

            <div className="form-field">
              <label>Category *</label>
              <select
                name="categoryId"
                required
                value={form.categoryId}
                onChange={change}
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>SKU (Stock Identifier) *</label>
              <input
                name="sku"
                required
                placeholder="e.g. LSY-WIG-001"
                value={form.sku}
                onChange={change}
              />
            </div>

            <div className="form-field">
              <label>Regular Price (₦) *</label>
              <input
                name="price"
                required
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={form.price}
                onChange={change}
              />
            </div>

            <div className="form-field">
              <label>Sale / Discount Price (₦)</label>
              <input
                name="discountPrice"
                type="number"
                min="0"
                step="any"
                placeholder="Optional discount"
                value={form.discountPrice}
                onChange={change}
              />
            </div>

            <div className="form-field">
              <label>Inventory Stock Units *</label>
              <input
                name="stock"
                required
                type="number"
                min="0"
                placeholder="Available qty"
                value={form.stock}
                onChange={change}
              />
            </div>

            <div className="form-field">
              <label>Brand / Designer</label>
              <input
                name="brand"
                placeholder="e.g. Lina Styled You"
                value={form.brand}
                onChange={change}
              />
            </div>

            <div className="form-field full-width">
              <label htmlFor="product-images">Product images (up to 8)</label>
              <label className="upload-label-btn image-upload-control" htmlFor="product-images">
                {uploading ? "Uploading images..." : "Choose images"}
              </label>
              <input
                id="product-images"
                type="file"
                className="visually-hidden"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={uploadImages}
                disabled={uploading}
              />
              <small className="field-hint">PNG, JPEG, or WebP; maximum 10 MB per image.</small>
              {(form.images.length > 0 || uploadPreviews.length > 0) && (
                <div className="form-image-previews">
                  {form.images.map((image, index) => (
                    <div className="form-image-preview" key={`${image}-${index}`}>
                      <img src={image} alt={`Product preview ${index + 1}`} />
                      <button
                        type="button"
                        className="remove-image-btn"
                        aria-label={`Remove image ${index + 1}`}
                        onClick={() =>
                          setForm((previous) => ({
                            ...previous,
                            images: previous.images.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {uploadPreviews.map((preview) => (
                    <div className="form-image-preview uploading" key={preview.url}>
                      <img src={preview.url} alt={`Preview of ${preview.name}`} />
                      <small>{uploading ? "Uploading..." : "Pending upload"}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-field full-width">
              <label>Description</label>
              <textarea
                name="description"
                rows="3"
                placeholder="Details about material, origin, texture, or fit..."
                value={form.description}
                onChange={change}
              />
            </div>

            {!editing && (
              <div className="form-field full-width">
                <label>Sizes / Variants (comma separated)</label>
                <input
                  name="sizes"
                  placeholder="e.g. 18 inch, 22 inch, 26 inch or Small, Medium, Large"
                  value={form.sizes}
                  onChange={change}
                />
                <small className="field-hint">Variants will automatically receive the entered inventory stock.</small>
              </div>
            )}
            <div className="form-field full-width">
              <label>Size guide</label>
              <textarea
                name="sizeGuide"
                rows="4"
                placeholder="Add sizing instructions or measurements for this product..."
                value={form.sizeGuide}
                onChange={change}
              />
              <small className="field-hint">This guide appears on the product page.</small>
            </div>
          </div>

          <div className="form-action-row">
            <button className="darkbtn admin-submit-btn" type="submit" disabled={uploading}>
              {uploading
                ? "Uploading images..."
                : editing
                  ? "Save Product Updates →"
                  : "Add Product to Storefront →"}
            </button>
            {editing && (
              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(empty);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Catalog Listing & Filtering */}
      <div className="catalog-list-section">
        <div className="catalog-header-bar">
          <div>
            <h3>Active Store Catalog</h3>
            <p className="catalog-subhead">
              {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"} found
            </p>
          </div>
          <div className="catalog-controls">
            <input
              className="catalog-search"
              placeholder="Search product name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="catalog-filter-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="catalog-cards-grid">
          {filteredProducts.map((p) => (
            <div key={p.id} className={`catalog-product-card ${!p.active ? "is-inactive" : ""}`}>
              <div className="card-thumb">
                <img src={p.image || "/lina-styled-you-logo.jpeg"} alt={p.name} />
                <span className={`stock-badge ${p.stock === 0 ? "out-badge" : p.stock <= 3 ? "low-badge" : "ok-badge"}`}>
                  {p.stock === 0 ? "SOLD OUT" : `${p.stock} in stock`}
                </span>
              </div>
              <div className="card-details">
                <span className="cat-pill">{p.category_name || "General"}</span>
                <h4>{p.name}</h4>
                <div className="card-pricing">
                  <strong>{money(p.discount_price || p.price)}</strong>
                  {p.discount_price && <del>{money(p.price)}</del>}
                </div>
                <small className="card-sku">SKU: {p.sku || "N/A"}</small>

                <div className="card-btn-actions">
                  <button className="action-btn edit-btn" onClick={() => edit(p)}>
                    Edit
                  </button>
                  {p.stock > 0 && (
                    <button className="action-btn sold-btn" onClick={() => soldOut(p)}>
                      Zero Stock
                    </button>
                  )}
                  <button className="action-btn delete-btn" onClick={() => remove(p)}>
                    {p.active ? "Remove" : "Archived"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!filteredProducts.length && (
            <div className="empty-catalog-box">
              <p>No products match your search or filter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Admin() {
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
        const failed = [
          ["dashboard", a],
          ["products", b],
          ["orders", c],
          ["customers", x],
        ].find(([, response]) => !response.ok);
        if (failed) {
          const [name, response] = failed;
          const details = await response.json().catch(() => ({}));
          if (response.status === 401) {
            throw Error("Your session has expired. Sign in again to manage the store.");
          }
          if (response.status === 403) {
            throw Error("Your account is not permitted to manage the store.");
          }
          throw Error(
            details.message || `Could not load admin ${name} (HTTP ${response.status}).`,
          );
        }
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
                <div key={o.id} className="list-row order-row" style={{ display: "block" }}>
                  <span>
                    <b>Order #{o.id}</b>
                    <small>
                      {o.customer_name || o.customer_email || "Customer"} • {o.status} | {o.payment_status}
                    </small>
                  </span>
                  <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                    {(o.items || []).map((item) => (
                      <small key={`${o.id}-${item.id || item.name}`}>
                        • {item.name} × {item.quantity} ({money(Number(item.unit_price) * Number(item.quantity))})
                      </small>
                    )) || <small>No items recorded</small>}
                  </div>
                  <strong style={{ display: "block", marginTop: 8 }}>{money(o.total)}</strong>
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
            {selectedCustomer && <section className="customer-orders panel"><div className="sectionhead"><h2>{selectedCustomer.name}'s orders</h2><button className="link" onClick={() => setSelectedCustomer(null)}>Close</button></div>{customerOrders.length ? customerOrders.map((order) => <div className="list-row" key={order.id}><span><b>Order #{order.id}</b><small>{order.status} | {order.payment_status}</small></span><div style={{ marginTop: 8, display: "grid", gap: 4 }}>{(order.items || []).map((item) => <small key={`${order.id}-${item.id || item.name}`}>• {item.name} × {item.quantity}</small>)} {!(order.items || []).length && <small>No items recorded</small>}</div><strong>{money(order.total)}</strong></div>) : <p>No orders found.</p>}</section>}
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
