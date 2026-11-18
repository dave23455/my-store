import React from "react";

interface VerificationEmailProps {
  otp: string;
  expiresAt: string;
}

export function VerificationEmail({ otp, expiresAt }: VerificationEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body style={{ margin: 0, backgroundColor: "#f8f5ef", fontFamily: "Arial, sans-serif", color: "#28231f" }}>
        <main style={{ maxWidth: "520px", margin: "32px auto", padding: "32px 24px", backgroundColor: "#ffffff", border: "1px solid #ead8df", borderRadius: "8px" }}>
          <p style={{ margin: "0 0 12px", color: "#bd0758", fontSize: "13px", fontWeight: 700 }}>LINASTYLEDYOU</p>
          <h1 style={{ margin: "0 0 16px", fontSize: "24px" }}>Verify your email</h1>
          <p style={{ fontSize: "16px", lineHeight: 1.5 }}>Enter this code to verify your account:</p>
          <p style={{ margin: "24px 0", color: "#bd0758", fontSize: "32px", fontWeight: 700, letterSpacing: "4px" }}>{otp}</p>
          <p style={{ fontSize: "14px", lineHeight: 1.5 }}>This code expires at {expiresAt} (UTC).</p>
          <p style={{ color: "#625b56", fontSize: "13px", lineHeight: 1.5 }}>If you did not create this account, you can ignore this email.</p>
        </main>
      </body>
    </html>
  );
}