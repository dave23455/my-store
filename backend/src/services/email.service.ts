import { ApiError } from "../utils/api.response.utils.js";
import { createElement } from "react";
import { render } from "@react-email/render";
import { VerificationEmail } from "./verification-email.js";

interface VerificationEmail {
  to: string;
  otp: string;
  expiresAt: Date;
}

export async function sendVerificationOtpEmail({
  to,
  otp,
  expiresAt,
}: VerificationEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new ApiError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "Verification email delivery is not configured."
    );
  }

  const text = `Your LinaStyledYou verification code is ${otp}. It expires at ${expiresAt.toISOString()}. If you did not create this account, you can ignore this email.`;
  const html = await render(createElement(VerificationEmail, {
    otp,
    expiresAt: expiresAt.toISOString(),
  }));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your LinaStyledYou account",
      text,
      html,
    }),
  });

  if (!response.ok) {
    console.error(
      `[email] Verification email delivery failed with HTTP ${response.status}.`
    );
    throw new ApiError(
      502,
      "EMAIL_DELIVERY_FAILED",
      "Your account was created, but the verification email could not be sent. Please request a new code."
    );
  }
}
