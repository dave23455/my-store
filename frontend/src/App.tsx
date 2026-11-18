import { Route, Routes } from "react-router-dom";
import { AccountDetails } from "./components/Account.jsx";
import { Admin } from "./components/Admin.jsx";
import { Login, VerifyEmail, ForgotPassword, ResetPassword, PaymentCallback } from "./components/Auth.jsx";
import { CartPage, Checkout } from "./components/Checkout.jsx";
import { Footer, Header } from "./components/Layout.jsx";
import { Home, Shop, Product, Contact } from "./components/Storefront.jsx";

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />
        <Route path="/account" element={<AccountDetails />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <Footer />
    </>
  );
}
