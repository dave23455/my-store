# LinaStyledYou — personal global store

A single-seller React + Express + PostgreSQL store. Customers browse products, manage a bag, authenticate, and place stock-validated orders. It deliberately has no seller registration or marketplace features.

## Run locally

1. Install Node.js 20+ and PostgreSQL 15+.
2. Create a database named `glow_market`.
3. Copy `backend/.env.example` to `backend/.env`, then set `DATABASE_URL` and a strong `JWT_SECRET`.
4. Run `cd backend; npm install; npm run db:migrate; npm run db:seed; npm run dev`.
5. In another terminal run `cd frontend; npm install; npm run dev`.

The storefront is at `http://localhost:5173`; API health is `http://localhost:4000/api/health`.

## Production configuration

Set `CLIENT_URL`, a production `DATABASE_URL`, `JWT_SECRET`, and `PAYMENT_PROVIDER`. The payment module is intentionally a provider boundary: add Paystack, Flutterwave, or Stripe credentials (for example `PAYSTACK_SECRET_KEY`) and implement server-side initialization, webhook signature verification, and payment verification in `backend/src/services/payment.service.js`. Never mark an order paid from the browser.

Product media stores URLs only, ready for Cloudinary/S3/Supabase Storage. Database tables cover products, variants, carts, orders, payments, addresses, reviews, comments, messages, and shipping zones/rates. Admin roles are represented securely in the `users.role` field; promote the owner directly in PostgreSQL after registration: `UPDATE users SET role='admin' WHERE email='you@example.com';`.

## Commands

`npm run db:migrate` creates schema and indexes. `npm run db:seed` adds removable sample categories/products. `npm run build` in `frontend` creates the deployable site.

## Public website deployment

The project includes `docker-compose.yml`, a production Nginx frontend, API, and PostgreSQL setup. This makes the public site use one domain: the browser calls `/api`, while Nginx privately proxies those requests to the API.

1. Rent or connect a VPS/cloud host and point your domain's DNS A record to it.
2. Install Docker and Docker Compose on that host.
3. Copy `.env.production.example` to `.env`, set strong unique `POSTGRES_PASSWORD` and `JWT_SECRET` values, and replace `PUBLIC_URL` with your HTTPS domain.
4. Upload this project and run `docker compose up -d --build`.
5. Run `docker compose exec api npm run db:migrate` and `docker compose exec api npm run db:seed` once.
6. Put HTTPS in front of port 80 using your host's managed SSL or Caddy/Nginx with a Let's Encrypt certificate.

Do not expose port 4000 or PostgreSQL to the public internet. Configure `RESEND_API_KEY` and `EMAIL_FROM` to enable reset-password emails.

## Vercel storefront deployment

Vercel can host the React storefront publicly, but it does not replace the Express API or PostgreSQL database. Deploy the API and database with the existing Render Blueprint, then deploy this repository to Vercel:

1. Import the GitHub repository into Vercel.
2. Leave the project root as the repository root. The included `vercel.json` builds `frontend` and serves its `dist` folder.
3. Add `VITE_API_URL` in Vercel with the API URL, for example `https://api.linastyle.shop/api`.
4. Deploy. Vercel provides a public `*.vercel.app` URL that works on phones and other devices.
5. Set the API's `CLIENT_URL` on Render to `https://lunastyle.vercel.app`, or to your custom storefront domain later, then redeploy the API.

For a custom domain, add it in Vercel and use that domain for `CLIENT_URL`. The API must also allow every storefront origin you use. The existing Render static-site setup is an alternative that keeps the frontend and API configuration together.

## Render + linastyle.shop

`render.yaml` defines a Render Postgres database, API, and static storefront. Push this repository to GitHub, then in Render choose **New > Blueprint** and select that repository. In the Render dashboard add `linastyle.shop` and `www.linastyle.shop` as custom domains on the `linastyle-web` service, and `api.linastyle.shop` on `linastyle-api`. Render will show the DNS CNAME records to add at your domain registrar, and it provisions HTTPS after DNS verifies.

Set these secret values in the `linastyle-api` Render service after the Blueprint is created: `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, and `EMAIL_FROM`. Set `PAYMENT_PROVIDER=paystack`. In Paystack set the webhook URL to `https://api.linastyle.shop/api/payments/webhook`. The application uses Paystack's server-side initialize/verify endpoints and validates webhook signatures before marking an order paid.

## Product images

For product uploads, create a Cloudinary account, open **Settings > Upload > Upload presets**, create an **unsigned** preset limited to images, then set `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` in the Render static site's environment and redeploy. The **Upload product image** picker in Admin > Catalog will then upload the image to Cloudinary and save its secure URL with the product.

### Temporary image URL method

Until Cloudinary is configured, use the **Image URL** field in Admin > Catalog:

1. Upload the picture to a public image host, or use an image already available online.
2. Copy the direct image address. It should normally end in `.jpg`, `.jpeg`, `.png`, or `.webp` and open the image itself in a browser.
3. Sign in as Kehinde or Anozie, open **Admin > Catalog**, and complete the product form.
4. Paste the address into **Image URL**. Leave the file picker unused.
5. Click **Add product** or **Save changes**.
6. Open **Shop** and refresh. The product picture should appear.

This method does not require Paystack or Cloudinary. Do not use a webpage address, Google search address, WhatsApp link, or a private Google Drive link; the address must be publicly readable by the browser.
