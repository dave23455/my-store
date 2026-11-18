import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, useAutoMessage, useStore } from "../shared.jsx";

export function Login() {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || ""),
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
        if (register && d.details?.userId) {
          nav(`/verify-email?userId=${encodeURIComponent(d.details.userId)}&email=${encodeURIComponent(email.trim())}`);
        }
        showMsg(d.message || (register ? "Could not create your account." : "Could not sign you in."));
        return;
      }
      if (register) {
        showMsg(d.message || "Check your email for the verification code.");
        nav(`/verify-email?userId=${encodeURIComponent(d.userId)}&email=${encodeURIComponent(email.trim())}`);
        return;
      }
      localStorage.setItem("token", d.token);
      window.dispatchEvent(new Event("store-auth-changed"));
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
          className="brand-image"
          src={settings.logo_url || "/lina-styled-you-logo.jpeg"}
          alt="LinaStyledYou"
        />
      </div>
      <h1>{register ? "Welcome" : "Welcome back"}</h1>
      <p>
        {register
          ? "Create a customer account. Check your email to verify it before signing in."
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
export function VerifyEmail() {
  const params = new URLSearchParams(window.location.search);
  const [userId, setUserId] = useState(params.get("userId") || "");
  const [email] = useState(params.get("email") || "");
  const [otp, setOtp] = useState("");
  const [message, showMessage, clearMessage] = useAutoMessage();
  const [verified, setVerified] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const response = await fetch(API + "/auth/verifyemail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, otp }),
    });
    const data = await response.json().catch(() => ({}));
    showMessage(data.message || (response.ok ? "Email verified." : "Could not verify this code."));
    if (response.ok) setVerified(true);
  }

  async function resend() {
    const response = await fetch(API + "/auth/resendverification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json().catch(() => ({}));
    showMessage(data.message || (response.ok ? "If verification is needed, a new code was sent." : "Could not resend the code."));
  }

  return (
    <main className="page auth">
      <h1>Verify your email</h1>
      <p>Enter the six-digit code sent to {email || "your email address"} to activate your account.</p>
      <form onSubmit={submit}>
        <input
          required
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength="6"
          placeholder="6-digit verification code"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button className="darkbtn">Verify email</button>
      </form>
      <button className="link" type="button" onClick={resend} disabled={!userId}>
        Resend verification code
      </button>
      {message && <p>{message} <button type="button" className="link" onClick={clearMessage}>×</button></p>}
      {verified && <Link to={`/login?email=${encodeURIComponent(email)}`}>Continue to sign in</Link>}
      {!userId && <p>Your verification link is missing its account ID. Register again or contact support.</p>}
    </main>
  );
}
export function ForgotPassword() {
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
      <p>Enter your email to generate a one-time code. During development, the code appears in the API server terminal; email delivery is not enabled yet.</p>
      <form onSubmit={submit}>
        <input
          required
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="darkbtn">Generate reset code</button>
      </form>
      {message && <p>{message} <button type="button" className="link" onClick={clearMessage}>×</button></p>}
      <Link to={`/reset-password?email=${encodeURIComponent(email)}`}>Enter your reset code</Link>
      <Link to="/login">Back to sign in</Link>
    </main>
  );
}
export function ResetPassword() {
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || ""),
    [otp, setOtp] = useState(""),
    [password, setPassword] = useState(""),
    [message, showMessage, clearMessage] = useAutoMessage(),
    nav = useNavigate();
  async function submit(e) {
    e.preventDefault();
    const r = await fetch(API + "/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, password }),
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
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength="6"
          placeholder="6-digit reset code"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
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
export function PaymentCallback() {
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
      <Link className="back-link" to="/account">
        <span aria-hidden="true">←</span> Back to my orders
      </Link>
    </main>
  );
}
