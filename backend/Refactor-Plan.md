# Backend Modular Refactor Plan

## Goal and decisions

Refactor the Express backend into feature modules, using the separation of concerns and shared middleware patterns from [`davidajagbe/mini-credit-service`](https://github.com/davidajagbe/mini-credit-service), while preserving this store's existing API and database behavior.

- Keep PostgreSQL with the existing `pg.Pool` and `pg-mem` development fallback. Do not introduce Prisma or replace SQL with an ORM.
- Use TypeScript for the active application and migrated modules. Keep SQL migrations and seed data as the database definition and setup path.
- Use feature-local DTO/schema, controller, service, and router/module files. Reuse shared database types, response helpers, middleware, and services where appropriate.
- Preserve existing endpoint paths, request/response shapes, authorization, and customer/admin workflows unless a separately agreed API change is needed.
- Refactor incrementally: migrate one feature, mount it, verify it, and only then remove its legacy route implementation.

## Current state and prerequisite

The backend already has TypeScript foundations: `app.ts`, a root router, shared HTTP/auth/validation/error middleware, database types and query code, and an `auth` module with DTOs, controller, service, and module files.

However, `backend/package.json` still runs `src/server.js` for both `dev` and `start`. That legacy server mounts the JavaScript route files directly. The new `app.ts` and `routes/index.ts` are therefore not yet the active server composition. The legacy server also has behavior that is not yet represented in `app.ts`/the root router, notably the raw-body Paystack webhook and `/api/settings`. Do not switch traffic to the new app or remove the legacy server until these behaviors are accounted for.

## Existing feature behavior and readiness review

This review compares the current Express routes and the storefront calls in `frontend/src/main.jsx` with the LinaStyledYou purchase, account, and admin flows. These are behavior inventories, not claims that the APIs have automated regression coverage; `backend/package.json` currently has no test script.

### Catalog — reviewed, wired, and focused tests passing

**Existing logic**

- Public `GET /categories` returns active categories.
- Public `GET /products` lists active products and supports text search, category slug, and `newest`, `price_asc`, `price_desc`, `popular`, and `rating` sorting. Search covers product name, description, SKU, and category name.
- Public `GET /products/:id` returns an active product with category name, images, and variants.
- Admin routes support product listing, create, partial update, soft removal, category changes, and size/variant management.
- The product form uses the `/admin/products` routes, sends one image URL and a list of sizes, and the product page lets a shopper choose a variant before adding it to the cart.

**Changes in this review**

- Replaced the active TypeScript app's public catalog mount with the TypeScript catalog module and mounted its catalog-owned admin routes under `/api/admin`. Kept other feature/admin route mounts commented as requested. Admin catalog endpoints now have one owner instead of shadowed duplicate product handlers.
- Kept the storefront's `/admin/products` contract, accepting its `image`/`sizes` input while also supporting `images`/`variants`. Product and variant writes are transactional; admin create/update responses include the primary image and active sizes. Product edits from the current form no longer submit an empty sizes list and unintentionally deactivate all existing variants.
- Restored add-size, update-size, and remove-size behavior at `/api/admin/products/:id/sizes` paths. Variant removal and product/category removal are soft deactivations. Reject duplicate active variant names and map duplicate SKU/category conflicts to `409`; reject assigning products to inactive categories.
- Adapted list queries to fetch image/variant rows separately, avoiding a correlated-subquery limitation in the `pg-mem` fallback while preserving the response's primary `image` and `sizes` fields.
- Updated Swagger to reflect the mounted admin catalog routes and actual response/status behavior.

**Validation performed:** Added a focused HTTP test over the TypeScript app and `pg-mem`, covering public category/product listing, all supported sort values, category/search filters, product detail, admin authorization, product create/update, image/variant response shape, variant stock/price update, add/remove variant, duplicate category/SKU/variant handling, inactive category rejection, soft product/category deactivation, and invalid product IDs. The test passes; backend typecheck and storefront production build pass.

**Remaining catalog gaps:** No pagination; category/sort controls are not exposed in the storefront; the current admin edit form preserves but does not edit variants (the API supports size add/update/remove); server cart/order variant stock and pricing behavior remains in those not-yet-reviewed modules. Continue to defer stock-rule changes until cart/orders are reviewed.

### Auth — OTP password-reset flow implemented; broader parity remains

**Existing logic:** Register, login, current profile, profile name/phone update, password-reset request and completion, and logout. Passwords are bcrypt-hashed. The storefront uses these routes for sign-in, registration, account details, checkout, and password reset.

**Password-reset change:** The two existing routes create and consume six-digit, one-time OTPs. `POST /auth/forgot-password` accepts `{ email }`; `POST /auth/reset-password` accepts `{ email, otp, password }`. OTPs are bcrypt-hashed (never stored as plaintext) in `password_reset_otps`, expire after 60 minutes, and are deleted after use or expiry. Expired rows are removed during OTP requests and reset attempts, and a server cleanup task also runs every ten minutes. A maximum of five failed attempts consumes an OTP. Responses do not disclose whether an email belongs to an account. In development, the generated password-reset code is printed to the API server terminal; password-reset email delivery and HTML templates remain deferred.

**Registration email verification change:** New registrations create an inactive account and send a six-digit OTP through Resend using `RESEND_API_KEY` and `EMAIL_FROM` with a plain-text message. No HTML email template is added. The response includes a `userId` UUID and `nextStep` instructions for `POST /auth/verifyemail` with `{ userId, otp }`. `POST /auth/resendverification` accepts `{ userId }`. The storefront now routes new registrants to a verification form, supports resending the code, and only returns them to sign-in after verification. Verification codes are bcrypt-hashed in `email_verification_otps`, expire after 60 minutes, are single-use, and are invalidated after five incorrect attempts. Login is denied until the email is verified. Resend responses do not disclose whether the user ID exists or still needs verification. Development logs include verification OTPs to enable local testing.

**Public user IDs and migration:** Keep the existing numeric `users.id` and its foreign keys as internal database keys. Add a unique, opaque UUID `users.public_id`; auth responses and newly issued JWTs expose/use this UUID rather than the sequential ID. Auth middleware resolves JWT subject UUIDs to the internal ID needed by existing foreign keys. Add `email_verified` with a default of `true`, so accounts that already exist when the migration runs remain usable; registration explicitly creates new accounts as unverified. The SQL migration backfills UUIDs and adds the OTP table/indexes before dropping `password_reset_tokens`. Both the TypeScript and legacy JavaScript auth paths now use the UUID IDs and verification contract; the legacy reset-link email helper was removed and plain-text verification email delivery is implemented. The database connector retries PostgreSQL with verified TLS, and the migration refuses to operate on the in-memory fallback.

**Validation performed:** Focused service and HTTP tests cover password-reset OTP generation, hashed storage and expiry, unknown-email response behavior, password update, single use, attempt limits and cleanup; registration OTP delivery, UUID-only public ID, login gating, successful verification, code reuse rejection, and resend invalidating the old code. Backend typecheck and frontend production build passed. Resend delivery is mocked in tests; no real email was sent. `npm run db:migrate` completed against configured PostgreSQL, and a direct schema check confirmed UUID/status columns and both OTP tables exist and the old reset-token table is gone.

**Validation performed:** Focused OTP tests cover six-digit validation, hashed storage and 60-minute expiry, generic responses for unknown emails, successful password update, single use, failed-attempt limits, and expired-row cleanup. Backend typecheck and frontend production build passed.

**Remaining auth parity checks:** The TypeScript module is active, but its profile response omits the legacy `token_payload`, error/status envelopes differ, and logout is stateless (as is the legacy implementation). Before broader auth sign-off, test duplicate email, invalid credentials, missing/deleted account, and profile fields. Do not treat these OTP changes as completion of the full auth parity review.

### Cart — reviewed, mounted, and focused tests passing

**Existing logic and contract:** Authenticated `GET /cart`, `DELETE /cart`, `POST /cart/items`, `PUT /cart/items/:id`, `DELETE /cart/items/:id`, and `POST /cart/merge`. The storefront stores guest items locally, posts them to `/cart/merge` after authentication, and then replaces local state with the returned server cart.

**Review findings and behavior confirmed:**

- Cart rows distinguish base products from variants. The storefront cart key includes both product and variant IDs, so multiple options of one product remain separate.
- Cart reads include active variant name/options, product image, effective price, and stock. Variant price falls back to product discount price, then product price; nullable variant stock falls back to product stock.
- Add and quantity updates lock the product/variant stock rows and enforce the corresponding available quantity. Inactive/missing products or variants are rejected. Item updates/removals are scoped to the authenticated user's cart.
- Guest-cart merge combines duplicate product/variant lines, checks resulting quantities against stock, and is transactional: any invalid/unavailable item or stock conflict rejects the whole merge. The guest cart is not replaced on a failed response.
- Cart operations surface errors through the storefront's cart error/retry UI; clear reports server errors instead of silently ignoring them.
- Enabled only the cart mount at `/api/cart`; other intentionally disabled route mounts remain unchanged.
- Added API-level coverage for authentication, CRUD, distinct variants, effective variant pricing/stock, image and option fields, owner isolation, invalid quantities/IDs, merge of duplicate lines, stock conflicts, unavailable items, and all-or-nothing merge rollback. Updated Swagger for the merge endpoint and active response fields.
- Stale signed-in cart items remain visible with `available: false`, retain their remove action, and block checkout. The cart total excludes unavailable lines. Active items whose requested quantity exceeds current stock remain adjustable and also block checkout until corrected.

**Validation performed:** Focused cart service/API tests and the app integration test pass; backend typecheck and Swagger parsing pass.

**PostgreSQL follow-up:** After testing against PostgreSQL, a quantity update returned `FOR UPDATE cannot be applied to the nullable side of an outer join`. The cart-item lookup now locks only the `cart_items` row before separately loading product/variant/cart public IDs; this avoids locking the nullable variant join and works with both PostgreSQL and `pg-mem`. The API regression test now updates a base-product cart item (no variant). The path parameter is the cart item's `id` from `GET /cart`, not a product/variant ID.

### Public identifier policy — UUID API IDs

Resource IDs exposed by the API are UUID strings; database primary keys and foreign keys remain numeric and internal. The schema now adds/backfills unique `public_id` columns for catalog, cart, order, payment, support, address, and shipping records. The `pg-mem` fallback registers `gen_random_uuid()` to match PostgreSQL defaults. Public catalog, cart, and order routes accept/return UUID IDs, and the storefront keeps them as strings. Internal user IDs continue to be resolved by auth middleware and are not returned by feature APIs. The user reports applying the migration and testing the orders module against PostgreSQL in Swagger.

### Orders — reviewed, mounted, and focused tests passing

**Existing logic:** Authenticated order creation validates active products and selected variants under row locks, calculates prices server-side, decrements stock, stores item snapshots, and creates the order within a database transaction. Shoppers can list their own orders and cancel unpaid pending orders; cancellation releases stock.

**Changes and checks:** Enabled only the TypeScript orders router at `/api/orders`. The module accepts UUID product/variant IDs, resolves internal keys server-side, aggregates duplicate product/variant lines before stock checks, locks stock rows, and calculates prices from current product/variant data. Order creation, stock decrement, order-item insertion, and persisted cart clearing are transactional. Unpaid pending cancellation and stock restoration are also transactional and return UUID order IDs. Required shipping country/city/address are validated. Current shipping behavior is a fixed `NGN 5,000`, matching the active module; order create/list/cancel responses expose UUID order/user IDs. Added focused HTTP tests for auth, invalid IDs, duplicate-line oversell prevention, server-side variant pricing/stock, cart clearing, ownership, cancellation stock restoration, and repeat cancellation. Updated Swagger.

**Remaining gap:** Shipping-zone/rate tables remain unused; the fixed shipping fee needs an agreed configurable rate policy before launch. Payment initialization and verification now use the order UUID contract.

### Payments — implemented and mounted; admin review remains deferred

**Existing logic:** Paystack initialization, reference persistence, verification, raw-body webhook signature verification, and manual payment confirmation. The storefront uses initialization and manual confirmation at checkout and a verification callback.

**Changes and checks:** Added payment DTO, controller, service integration, and router. Mounted only customer payment endpoints under `/api/payments`; the raw-body Paystack webhook remains at the app boundary and now uses the TypeScript service. Initialization and manual confirmation accept order UUIDs and verify ownership; public payment references no longer embed internal numeric order IDs. Initialization allows only unpaid pending orders and prevents a second pending payment. Manual confirmation checks the exact order total and prevents duplicate pending confirmations. Online and manual payment attempts are mutually exclusive while either is pending. Verification checks the provider reference, amount, and currency, scopes authenticated verification to the owning user, and applies idempotent paid/failed transitions. Failed verification and pending-order cancellation/stock restoration now share one transaction. Added API tests for initialization, duplicate/overlapping attempts, ownership, paid/idempotent verification, amount mismatch, manual confirmation checks, failed-payment stock restoration, and webhook signature/body handling. Updated Swagger.

**Paystack Inline checkout:** The storefront now loads Paystack Inline v2, requests a unique reference and server-calculated amount/currency from the API, opens the popup, and verifies successful callbacks server-side. Closing/failing checkout cancels the local pending attempt so the shopper can retry; a retry button remains available after an order is created. The browser reads only `PAYSTACK_PUBLIC_KEY`; `PAYSTACK_SECRET_KEY` remains server-side. Added `frontend/.env.example`, and `.env.local` is ignored. A local test-mode public key still needs to be configured and the frontend dev server restarted before exercising the popup.

**Remaining:** Manual confirmation approval/rejection remains in the legacy admin routes and is not mounted yet; migrate it with the Admin module. The payments API tests mock Paystack responses; no live provider transaction was made.

### Admin — dashboard and management exist; consistency and validation gaps remain

**Existing logic:** Dashboard totals/low stock/recent orders; product management; order listing/status updates; customer listing and customer order history; staff listing plus owner-only staff creation/removal; manual-payment review; and settings read/update. Admin/owner authorization is applied to the admin router, with owner-only staff mutations. Public settings are read separately by the storefront.

**Gaps:** Product routes overlap the catalog/admin-products routers as described above. Order status changes are not constrained by an explicit transition policy; settings updates replace the stored JSON object rather than merging omitted fields; category management is split into the admin route despite being catalog data. Message inbox has list-only behavior, and staff/account actions need route-level authorization parity checks. Keep admin-owned order, staff, dashboard, and store-setting workflows distinct from catalog-owned product/category/variant workflows.

### Support — customer-facing submission exists; moderation is partial

**Existing logic:** Public contact-message submission and admin inbox listing; public approved-review and approved-comment reads; authenticated review and question/comment submission. Reviews require a paid purchase, are unique per product/user, and update the product rating.

**Gaps:** Reviews are immediately marked approved despite the schema default and no moderation API; comments are immediately visible by default. There are no admin moderation, message read/archive/reply, or comment-thread management routes. Comment parent IDs exist in the schema but the API does not expose threaded replies. Contact submission is not linked to an authenticated user. Define whether moderation and inbox actions are required for the first release; do not imply those capabilities are already implemented.

### App and database foundation — blocking prerequisite

The current JavaScript server is the only active composition. The TypeScript root mounts auth and health only; it lacks public settings, catalog, cart, order, support, admin, payment routes, and raw-body webhook handling. Preserve parser/middleware order, route prefixes, CORS, docs, health, and settings when making TypeScript the active server. Keep SQL migration/seed and the `pg`/`pg-mem` behavior intact.

## Target structure

Follow the existing `auth` module's naming conventions; for each feature, use the relevant files rather than creating empty layers:

```text
backend/src/modules/<feature>/
├── dto/
│   └── <feature>.dto.ts
├── <feature>.controller.ts
├── <feature>.service.ts
└── <feature>.module.ts
```

Keep cross-feature infrastructure outside modules, including `config/db.ts`, shared middleware, database types, response utilities, and genuinely shared services. The root router should compose feature routers while retaining the current public `/api` route contract.

## Migration sequence

### 0. Activate and verify the TypeScript application (blocking)

Before migrating catalog:

1. Use the behavior inventory above as the baseline; record route prefixes, response shapes, status codes, and parser/middleware ordering for each route.
2. Wire the TypeScript app into the documented `dev` and `start` commands using the repository's supported TypeScript runtime/build approach. Keep the existing JavaScript server available until the replacement is verified.
3. Ensure the new composition preserves all current routes, including health, public/admin settings, docs, all feature endpoints, and Paystack webhook behavior. The webhook must receive the raw request body for signature verification before JSON parsing.
4. Confirm the shared `pg` query layer and `pg-mem` fallback work from the active TypeScript runtime; retain migration and seed commands.
5. Add focused regression checks for route mounting, response/error compatibility, auth, CORS, parser ordering, and database setup. Add the test command to `package.json` when the test harness is established.

**Exit check:** the normal development/start commands serve the TypeScript app, and existing API behavior needed by the frontend is still available.

### 1. Catalog — next feature

Resolve the catalog readiness gaps before changing route ownership. Then consolidate public catalog and admin catalog operations from `routes/catalog.js`, `routes/admin.js`, and `routes/admin-products.js` into the catalog module. Avoid preserving overlapping product/category/variant write implementations as separate sources of truth.

- Public: active categories; product listing; search; category and sort filters; product details with images and variants.
- Admin: product listing and management; create, update, and soft-delete products; category management; variant/size create, update, and delete.
- Put request schemas in catalog DTOs, database/business operations in services, and HTTP mapping in controllers. Reuse the shared auth/role middleware for protected management routes.
- Preserve existing public and admin URLs, including their current mount prefixes, unless frontend call sites are migrated in the same change.
- Define a single admin request/response contract that matches the current form, including image and variant editing, and document any necessary frontend call-site change.
- Preserve sorting/search behavior, validation, product/image/variant fields, and soft-delete semantics. Define behavior for zero prices, variant price inheritance, variant stock versus product stock, and category deletion with assigned products.
- Keep multi-row product/image/variant writes consistent; use a database transaction where an operation must succeed or fail as a unit. Add pagination only if agreed as part of the storefront change.

**Exit check:** exercise public listing/search/filter/detail and authorized admin create/update/delete/category/variant flows, including invalid input, missing products, duplicate SKU/category, assigned-category deletion, variant stock/price, and database errors; verify frontend image/variant edits and compare response contracts with the recorded baseline.

### 2. Cart — implementation complete

Cart read and item CRUD are implemented in the TypeScript module and mounted under `/api/cart`. Keep the legacy route untouched until the broader route migration no longer needs it.

**Exit check:** focused service/API tests cover add, read, quantity update, remove, clear, separate variants, variant stock/pricing, guest-cart merge, unauthorized access, invalid quantities, ownership, unavailable-item visibility/removal, and merge rollback.

### 3. Orders — implementation complete; shipping-rate policy remains

The TypeScript module is mounted at `/api/orders`; it uses UUID public identifiers and server-side price calculation. Keep the legacy route untouched until the broader route migration no longer needs it.

**Exit check:** focused HTTP tests cover successful/rejected order flows, duplicate lines, product/variant stock and pricing, required shipping address fields, cart clearing, ownership, cancellation stock restoration, and repeat cancellation. Define configurable shipping-zone/rate behavior before launch and adapt payment integration when the payments module is reviewed.

### 4. Payments

Define and implement safe, idempotent payment/order transitions, order eligibility, manual amount checks, and transactional stock release. Then move payment endpoints from `routes/payments.js` and integrate the existing `services/payment.service.js` into the payments module. Preserve Paystack initialization, verification, manual payment confirmations, and webhook signature verification. Keep raw-body webhook parsing at the application boundary.

**Exit check:** verify online and manual payment flows, amount mismatch, canceled/non-pending orders, duplicate submissions/events, all payment/order state transitions, stock release, and that webhook parsing/signature validation work end to end.

### 5. Admin

Move dashboard, order/user/message management, and store settings from `routes/admin.js` and the legacy `/api/settings` handler into admin-focused module routes/services. Keep `owner`/`admin` authorization distinctions and existing settings behavior. Decide whether settings updates merge partial values or replace the full object, and define allowed order status transitions. Catalog product/category/variant management remains owned by the catalog feature.

**Exit check:** verify role restrictions, staff operations, dashboard/order/customer/message/settings responses, status transitions, and partial settings updates against the chosen contract.

### 6. Support

Decide whether first-release support requires review/comment moderation, threaded questions, and message read/archive/reply actions. Then move contact messages from `routes/support.js` and include the review and product-question/comment endpoints currently used by the storefront. Preserve verified-purchaser rules and keep customer support submission distinct from admin inbox management.

**Exit check:** verify contact submission, verified reviews, review-rating updates, comment visibility/threading, and each agreed moderation/inbox operation.

### 7. Remove legacy implementations and finish documentation

After each feature passes its exit check, remove only that feature's duplicate legacy route implementation and update route/API documentation. Record each implementation change and its verification in this plan before or in the same change that introduces it. Once all routes have moved, remove the old JavaScript server composition and duplicate implementations that are no longer used. Keep migration, seed, payment, and email functionality intact.

Also reconcile the project overview's stated table count with the tables listed in the overview and actual schema before treating it as the final architecture reference.

## Per-feature completion checklist

- DTO validation runs before controller logic and produces the established error response.
- Controllers handle HTTP concerns; services own feature behavior and database operations.
- Shared middleware and database/response helpers are reused rather than copied into modules.
- Existing URLs, status codes, response shapes, authentication, and authorization are preserved.
- Related regression checks pass before the legacy implementation is removed.
- API documentation and the project overview are updated when the feature surface or architecture changes.