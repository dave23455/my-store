# Deployment & Architecture Plan: `linastyledyou.com` (All-in-One Hosting.com cPanel + Local PostgreSQL)

> **Instructions for GitHub Copilot (VS Code):**
> Use this document as the single source of truth for preparing, configuring, building, and deploying this repository (`my store` — React/Vite frontend + Express/TypeScript backend + PostgreSQL) to **Hosting.com cPanel shared hosting** (`linastyledyou.com`). All three layers (Frontend SPA, Express API, and PostgreSQL database) run on the same Hosting.com cPanel account. Follow every constraint and step below accurately.

---

## 1. Executive Summary & Selected Architecture

* **Target Domain:** `linastyledyou.com` (API subdomain: `api.linastyledyou.com`)
* **Hosting Provider:** **Hosting.com cPanel Shared Hosting** (Starter or Pro — identical Node.js & PostgreSQL tooling; Starter = 2 vCPU / 2 GB RAM / 30 entry processes / 15 GB NVMe; Pro = 4 vCPU / 4 GB RAM / 60 entry processes / 50 GB NVMe).
* **Unified Stack Layout:**
  * **Frontend (`frontend/`):** Static Vite/React SPA (`dist/`) served from `public_html/` with Apache `.htaccess` fallback rewrites to `index.html`.
  * **Backend (`backend/`):** Compiled Node.js/Express API deployed via cPanel **Setup Node.js App** (CloudLinux Phusion Passenger) on `api.linastyledyou.com`.
  * **Database:** **Local cPanel PostgreSQL** (`1 GB` max per DB, managed via **cPanel → PostgreSQL Databases** and **phpPgAdmin**), accessed internally via `localhost:5432` using the standard `pg` driver.
  * **Transactional Email:** **React Email** (`@react-email/components` + `@react-email/render`) rendered on Express and sent via **Resend REST API** over outbound HTTPS port `443` (with `orders@linastyledyou.com` created in cPanel Email Accounts to receive customer replies; optional `nodemailer` local SMTP fallback documented below).
  * **Media Storage:** **Cloudinary Free Tier** (25 monthly shared credits) over HTTPS port `443`.
  * **Payments:** **Paystack REST API** (`https://api.paystack.co`) over HTTPS port `443`.

### Why This Architecture Was Chosen
1. **Zero External Database Dependency or Firewall Friction:** Hosting.com’s shared firewall blocks *outbound* TCP ports `5432`/`6543` to external hosts (like Supabase), **but** PostgreSQL is enabled locally in cPanel (`localhost:5432`). Connecting Express to local PostgreSQL keeps traffic internal with `<5ms` latency and requires **zero refactoring** of existing `pg` SQL queries.
2. **No Cold Starts or 30-Day DB Expiration:** Unlike Render Free (15-min idle spin-down + 30-day Postgres deletion) or Supabase Free (7-day inactivity pause), the storefront, API, and PostgreSQL database stay persistently available under one bill.
3. **Budget & Upgrade Path:** Starter covers Year 1 for **₦21,600 + tax** (including `linastyledyou.com` free in Year 1), and Pro covers Year 1 for **~₦49,334.40 + tax** if double CPU/RAM/entry-process headroom is desired. Year 2 renews at standard rates (`₦72,000/yr` Starter or `₦144,000/yr` Pro + `₦28,999/yr` domain, excl. tax).

---

## 2. Verified Server Constraints & Rules for Copilot

1. **Database Connection (`localhost` only):**
   * Connect to PostgreSQL on `127.0.0.1` / `localhost` port `5432` using the cPanel-prefixed database name and user (e.g., `cpaneluser_linastyle` / `cpaneluser_dbuser`).
   * **Do NOT enable SSL (`ssl: { rejectUnauthorized: false }`) for `localhost` PostgreSQL** unless explicitly required—local Unix/loopback Postgres on cPanel typically expects `ssl: false` (or `PGSSLMODE=disable`), whereas external cloud DBs require SSL. Make SSL configurable via `DB_SSL=false` in `backend/src/config/db.ts`.
   * Keep database storage well below the **1 GB per-database limit** by storing all product images on Cloudinary (store only Cloudinary `secure_url` and `public_id` strings in Postgres).
2. **Phusion Passenger Compatibility (`Setup Node.js App`):**
   * Do **not** hardcode a port like `app.listen(5000)` without reading `process.env.PORT`. Passenger binds the socket automatically when `process.env.PORT` is respected.
   * Provide a root `backend/app.js` CommonJS entry file because cPanel’s Node.js Selector defaults to `app.js`.
   * Keep Express **stateless** (no in-memory cart/session stores or long-lived `setInterval` workers), as CloudLinux periodically recycles idle shared-hosting processes.
3. **Never Build on the Shared Server:**
   * Running `vite build` or `tsc` on shared hosting can exceed RAM/entry-process caps and get killed. Always compile `frontend/dist` and `backend/dist` locally on Windows and upload compiled artifacts.
4. **Outbound Port `443` Open / External SMTP Restricted:**
   * Outbound HTTPS (`443`) to `api.paystack.co`, `api.cloudinary.com`, and `api.resend.com` is unrestricted.
   * External SMTP ports (`587`/`465`/`25`) are restricted on shared hosting, and cPanel mail caps sending at **100 emails/hour**. Sending transactional receipts via **Resend over HTTPS (`443`)** avoids both limits.

---

## 3. Codebase Preparation Tasks for GitHub Copilot

### Task 1: Configure `backend/src/config/db.ts` for Local cPanel PostgreSQL
Ensure `backend/src/config/db.ts` supports standard `DATABASE_URL` over `localhost` without forcing SSL when `DB_SSL=false`:

```ts
import { Pool } from 'pg';

const isSslEnabled = process.env.DB_SSL === 'true';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSslEnabled ? { rejectUnauthorized: false } : false,
  max: 10, // Keep pool modest for shared hosting connection limits
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});