export async function sendVerificationOtpEmail({ to, otp, expiresAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const error = new Error('Verification email delivery is not configured.');
    error.status = 503;
    throw error;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Verify your LinaStyledYou account',
      text: `Your LinaStyledYou verification code is ${otp}. It expires at ${expiresAt.toISOString()}. If you did not create this account, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    console.error(`[email] Verification email delivery failed with HTTP ${response.status}.`);
    const error = new Error('Verification email delivery failed.');
    error.status = 502;
    throw error;
  }
}
