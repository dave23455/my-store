export async function sendPasswordResetEmail({to, link}) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body: JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject:'Reset your LinaStyledYou password',html:`<p>We received a request to reset your password.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 30 minutes. If you did not ask for this, you can ignore this email.</p>`})
  });
  return response.ok;
}
