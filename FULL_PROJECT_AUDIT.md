# Q Order — Full Project Audit Report (v3)

**Date:** March 10, 2026  
**Scope:** Complete codebase — Backend, Admin Frontend, Customer Frontend, Database, Deployment, Tests  
**Files Reviewed:** 120+ across all packages

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **CRITICAL** | 8 |
| **HIGH** | 19 |
| **MEDIUM** | 22 |
| **LOW** | 10 |
| **POSITIVE** | 28 |
| **TOTAL** | 87 |

**Overall Posture:** The project has a solid foundation with strong authentication patterns, comprehensive rate limiting, proper tenant isolation, and good CSRF protection. Several fixes from the previous audit (March 5, 2026) have been applied. The most critical remaining risks are in **deployment configuration** (no HTTPS, exposed ports), **database schema** (missing indexes, cascade deletes), and **customer frontend security** (no-op sanitizer, unauthenticated socket).

---

## Table of Contents

1. [CRITICAL Issues](#1-critical-issues)
2. [HIGH Issues](#2-high-issues)
3. [MEDIUM Issues](#3-medium-issues)
4. [LOW Issues](#4-low-issues)
5. [Positive Findings](#5-positive-findings)
6. [Previous Audit — Resolved Issues](#6-previous-audit--resolved-issues)
7. [Prioritized Remediation Plan](#7-prioritized-remediation-plan)

---

## 1. CRITICAL Issues

### C-1: HTTPS/TLS Not Enabled
- **Area:** Deployment
- **Files:** `nginx.conf`, `docker-compose.yml`
- **Issue:** HTTP-only configuration. HTTPS server block commented out. All traffic (credentials, payment data, PII) transmitted in plaintext.
- **Impact:** PCI DSS non-compliance. Man-in-the-middle attacks on payment/auth flows.
- **Fix:** Obtain SSL certificates (Let's Encrypt), enable HTTPS server block, add HTTP→HTTPS redirect, enable HSTS.

### C-2: Container Ports Directly Exposed
- **Area:** Deployment
- **Files:** `docker-compose.yml` (lines 52, 104, 121)
- **Issue:** Backend (3000), customer (5173), admin (5174) ports directly exposed to host, bypassing nginx reverse proxy.
- **Impact:** Direct access bypasses security headers, rate limiting, CSP. DDoS attack surface.
- **Fix:** Remove direct port bindings. Route all traffic through nginx only. Use Docker internal networking.

### C-3: Missing Database Indexes on High-Cardinality Foreign Keys
- **Area:** Database
- **Files:** `prisma/schema.prisma`
- **Issue:** `OrderItem.menuItemId`, `OrderItemModifier.modifierId`, `Modifier.modifierGroupId` have no `@@index`. Every order detail fetch performs full table scans.
- **Impact:** For 50 active orders (3 items, 2 modifiers each) = ~500 sequential scans instead of index lookups. Severe performance degradation at scale.
- **Fix:** Add `@@index([menuItemId])`, `@@index([modifierId])`, `@@index([modifierGroupId])` to respective models.

### C-4: Cascading Deletes on Tenant Boundaries
- **Area:** Database
- **Files:** `prisma/schema.prisma`
- **Issue:** Deleting a Restaurant cascades to delete ALL branches, orders, payments, and customer data irreversibly. No soft-delete pattern.
- **Impact:** Accidental or malicious restaurant deletion destroys years of order history and payment records. PCI DSS requires 6+ year retention for payment records.
- **Fix:** Change `onDelete: Cascade` to `onDelete: Restrict` on Restaurant relations. Implement soft-delete (`deletedAt`, `isActive`) pattern.

### C-5: Customer `sanitize()` Is a No-Op
- **Area:** Customer Frontend
- **Files:** `packages/customer/src/utils/sanitize.ts`
- **Issue:** Function returns input unchanged: `return value`. If `dangerouslySetInnerHTML` is ever used with this function, XSS is possible. Developers will falsely believe inputs are sanitized.
- **Fix:** Replace with DOMPurify (matching admin package): `return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] })`.

### C-6: Customer Socket Has Zero Authentication
- **Area:** Customer Frontend
- **Files:** `packages/customer/src/context/SocketContext.tsx`
- **Issue:** Customer socket connects with no auth token, session identifier, or table verification. Anyone who knows an order ID or table ID can subscribe to its real-time events.
- **Impact:** Information disclosure — attacker can monitor order statuses, table events, payment acknowledgments for any table.
- **Fix:** Send session token as socket auth. Backend should validate session ownership before allowing room joins.

### C-7: Razorpay/Twilio/WhatsApp Secret Keys in Frontend Form State
- **Area:** Admin Frontend
- **Files:** `packages/admin/src/pages/SettingsPage.tsx`
- **Issue:** `razorpayKeySecret`, `whatsappAccessToken`, `twilioAuthToken` are accepted in the settings form, stored in React state, and sent to the backend. Secrets are visible in browser DevTools, memory, and potentially error tracking.
- **Fix:** Remove secret key inputs from frontend entirely. Use write-only pattern or backend-only secret configuration. Backend should never return secrets in GET responses.

### C-8: Race Condition in Session Token Rotation
- **Area:** Backend
- **Files:** `packages/backend/src/services/orderService.ts`
- **Issue:** Token rotation happens AFTER the transaction commits. Between commit and rotation, the old token remains valid, allowing a second order on the same QR scan.
- **Fix:** Move token rotation INSIDE the transaction with `SELECT ... FOR UPDATE` on the table row.

---

## 2. HIGH Issues

### H-1: Socket.io Authentication is Fail-Open
- **Area:** Backend
- **Files:** `packages/backend/src/socket/index.ts`
- **Issue:** Socket auth middleware allows all connections if `requireAuth` is not set. The flag is client-controlled (honor system).
- **Fix:** Track `socket.data.isAuthenticated` properly. Require authentication for admin operations. For customer sockets, require at least session token verification.

### H-2: Missing Temporal Indexes for Session Expiry
- **Area:** Database
- **Files:** `prisma/schema.prisma`
- **Issue:** Session expiry job scans all `TableSession` records every 5 minutes. Missing `@@index([status, expiresAt])` and `@@index([status, lastActivityAt])`.
- **Fix:** Add composite temporal indexes.

### H-3: Discount Usage Recording Outside Transaction
- **Area:** Backend
- **Files:** `packages/backend/src/services/orderService.ts`
- **Issue:** Order created inside transaction, but discount/coupon usage increment is a fire-and-forget post-op. If it fails, customer can reuse single-use coupons indefinitely.
- **Fix:** Move discount recording inside the order creation transaction.

### H-4: Session Merge Without Pessimistic Locking
- **Area:** Backend
- **Files:** `packages/backend/src/services/sessionService.ts`
- **Issue:** Session merge uses default ReadCommitted isolation without row locks. Concurrent modifications can corrupt order-session linkages.
- **Fix:** Add `SELECT ... FOR UPDATE` locks on both source and target sessions inside the transaction.

### H-5: Order Number Entropy Risk
- **Area:** Backend
- **Files:** `packages/backend/src/services/orderService.ts`
- **Issue:** 4-char hex = 4,096 unique values per day per restaurant. High-volume restaurants (6,000+ orders/hour) risk collision exhaustion beyond retry capacity.
- **Fix:** Increase entropy to 6-8 hex chars, or use timestamp-based IDs.

### H-6: Modifier `onDelete: Restrict` Blocks Menu Management
- **Area:** Database
- **Files:** `prisma/schema.prisma`
- **Issue:** Staff cannot delete old/deprecated modifiers because historical `OrderItemModifier` references prevent deletion. No user-friendly error.
- **Fix:** Change to `onDelete: SetNull` on `OrderItemModifier.modifier`, or implement soft-delete on `Modifier`.

### H-7: PIN Brute Force — No Client-Side Throttle
- **Area:** Admin Frontend
- **Files:** `packages/admin/src/components/LockScreen.tsx`
- **Issue:** 6-digit PIN auto-submits immediately on completion with no delay between attempts. Backend rate-limiter helps but fast local attempts bypass it temporarily.
- **Fix:** Add exponential backoff after failed attempts (500ms, doubling after 3 failures, capped at 10s).

### H-8: Queue Display Page Exposes Order Data Without Auth
- **Area:** Customer Frontend
- **Files:** `packages/customer/src/pages/QueueDisplayPage.tsx`
- **Issue:** Route `/queue/:restaurantId` shows all active orders (numbers, customer names, statuses) with no authentication. May be intentional for kiosk displays.
- **Fix:** If intentional, mask customer names (first letter only). If not, add queue PIN/password.

### H-9: Customer Session Token Optional in Order Creation
- **Area:** Customer Frontend
- **Files:** `packages/customer/src/services/orderService.ts`
- **Issue:** `sessionToken` defaults to `undefined` if not in sessionStorage. Orders proceed without session verification, enabling QR replay.
- **Fix:** Make session token mandatory. If missing, direct user to scan QR code again.

### H-10: Idempotency Key Not Persistent Across Page Reloads
- **Area:** Customer Frontend
- **Files:** `packages/customer/src/services/orderService.ts`, `packages/customer/src/state/cartStore.ts`
- **Issue:** Idempotency key generated from Zustand state. If cart is cleared (page refresh) between retries, a new key is generated, defeating idempotency.
- **Fix:** Store idempotency key in sessionStorage. Clear only after successful order confirmation.

### H-11: CSP Allows `unsafe-inline` for Styles
- **Area:** Deployment
- **Files:** `nginx.conf`
- **Issue:** `style-src 'self' 'unsafe-inline'` allows injected CSS for data exfiltration or UI defacement.
- **Fix:** Use nonce-based styles or CSS Modules where possible.

### H-12: No nginx Rate Limiting
- **Area:** Deployment
- **Files:** `nginx.conf`
- **Issue:** No `limit_req_zone` configuration. Backend has Express rate limiters, but nginx-level protection is missing for DDoS defense.
- **Fix:** Add `limit_req_zone` for `/api/auth/` (5r/m), `/api/` (10r/s), and general requests.

### H-13: Session Transfer Missing Branch Validation
- **Area:** Backend
- **Files:** `packages/backend/src/services/sessionService.ts`
- **Issue:** Transfer allows moving sessions across branches (only checks `restaurantId`, not `branchId`). Orders could be charged to wrong branch.
- **Fix:** Validate source and target tables are in the same branch (or one is null/shared).

### H-14: nginx Runs as Root
- **Area:** Deployment
- **Files:** `Dockerfile.frontend`
- **Issue:** Default nginx image runs as root. If nginx is compromised, attacker has root access to the container.
- **Fix:** Add non-root user directive to Dockerfile.

### H-15: Hardcoded WebSocket Localhost in CSP
- **Area:** Deployment
- **Files:** `nginx.conf`
- **Issue:** CSP allows `ws://localhost:*` — will break in production (blocks WebSockets) or force CSP removal.
- **Fix:** Use nginx `$host` variable or environment-based CSP for WebSocket origins.

### H-16: CORS Default Allows Localhost Only
- **Area:** Backend
- **Files:** `packages/backend/src/config/index.ts`
- **Issue:** Default CORS origin `http://localhost:5173,http://localhost:5174` — invalid for production. Missing `.env` breaks production deployments.
- **Fix:** No default for production. Reject requests if CORS_ORIGIN contains `localhost` when `NODE_ENV=production`.

### H-17: No Container Resource Limits
- **Area:** Deployment
- **Files:** `docker-compose.yml`
- **Issue:** No CPU/memory limits on any container. Single container can consume all host resources.
- **Fix:** Add `deploy.resources.limits` for CPU and memory on all services.

### H-18: Customer PII in Unencrypted IndexedDB
- **Area:** Customer Frontend
- **Files:** `packages/customer/src/utils/offlineDb.ts`
- **Issue:** Offline order queue stores customer name/phone in plain IndexedDB. No TTL, no encryption, no cleanup.
- **Fix:** Encrypt sensitive fields before storage. Add TTL-based cleanup.

### H-19: Session Touch is Fire-and-Forget
- **Area:** Backend
- **Files:** `packages/backend/src/services/orderService.ts`
- **Issue:** `sessionService.touchSession()` called without `await`. If it fails, session may expire during active ordering.
- **Fix:** Await the touch call or include it in the order creation transaction.

---

## 3. MEDIUM Issues

| # | Issue | Area | Impact |
|---|-------|------|--------|
| M-1 | Admin auth store persists user object in localStorage (role tamperable) | Admin FE | Client-side permission bypass (UX-only; backend enforces) |
| M-2 | Customer localStorage stores PII without consent notice | Customer FE | Privacy compliance (GDPR) |
| M-3 | Socket reconnection uses stale access token until refresh | Admin FE | Brief auth failure window on reconnect |
| M-4 | Error messages may leak backend details (5xx errors shown raw) | Both FE | Information disclosure |
| M-5 | `forceLogout()` doesn't clear sessionStorage or React Query cache | Admin FE | Stale data in memory briefly |
| M-6 | Orphaned orders auto-reassigned without logging | Backend | Hidden bugs in session management |
| M-7 | Redis errors logged to `console` instead of structured logger | Backend | Invisible Redis failures in production monitoring |
| M-8 | Implicit Decimal precision issues in session totals | Backend | Rounding errors on financial calculations |
| M-9 | Payment gateway order creation not idempotent (customer `useRazorpay`) | Customer FE | Duplicate gateway orders on network failure |
| M-10 | Database connection string in plaintext `.env` (not Docker Secrets) | Deployment | Credential exposure risk |
| M-11 | Redis password transmitted plaintext (no TLS) | Deployment | Sniffable auth token on internal network |
| M-12 | CSP allows `data:` and `blob:` in `img-src` | Deployment | Potential data exfiltration via images |
| M-13 | API response cache duration 24h (stale menu data) | Customer FE | Menu changes take 24h to appear |
| M-14 | JWT secret validation checks length only, not entropy | Backend | Weak secrets pass validation |
| M-15 | No `Permissions-Policy` header in HTTPS block template | Deployment | Missing when HTTPS is enabled |
| M-16 | No frontend healthchecks in docker-compose | Deployment | Orchestrator can't detect dead frontends |
| M-17 | Cart special instructions may contain PII in localStorage | Customer FE | Allergy/dietary info exposed |
| M-18 | Persisted user object not validated on rehydration (admin authStore) | Admin FE | Tampered localStorage accepted |
| M-19 | Missing ProtectedRoute error boundary | Admin FE | Query errors crash entire page |
| M-20 | Vite source map build verification missing in CI | Deployment | Accidental source code exposure |
| M-21 | Cross-tab token refresh race condition | Admin FE | Multiple tabs refresh simultaneously |
| M-22 | Razorpay key format not validated client-side | Customer FE | Bad config fails late at payment time |

---

## 4. LOW Issues

| # | Issue | Area |
|---|-------|------|
| L-1 | `err: any` type assertions in catch blocks | Both FE |
| L-2 | `generateCartItemId()` uses `Math.random()` (fine for UI keys) | Customer FE |
| L-3 | No `maxLength` on text inputs (restaurant name, descriptions) | Admin FE |
| L-4 | Console logging gate `import.meta.env.DEV` may include staging | Customer FE |
| L-5 | Offline order sync silently discards failed retries | Customer FE |
| L-6 | Prisma migration runs on every container start | Deployment |
| L-7 | No explicit timezone in Docker containers | Deployment |
| L-8 | No centralized logging driver in docker-compose | Deployment |
| L-9 | 2 TODO comments in tableService.ts (invoice/staff assignment) | Backend |
| L-10 | `.env.example` incomplete (missing payment/external service vars) | Config |

---

## 5. Positive Findings

### Authentication & Security
- ✅ JWT access tokens NOT persisted to storage (in-memory only)
- ✅ Refresh tokens stored as SHA-256 hashes in database
- ✅ HttpOnly, Secure, SameSite cookies for refresh tokens
- ✅ Comprehensive rate limiting (auth: 50/15min, PIN: 5/5min, OTP: 5/10min, orders: 20/min)
- ✅ CSRF protection on cookie-bound endpoints (`/auth/refresh`, `/auth/logout`)
- ✅ Concurrent token refresh coalescing (prevents thundering herd)
- ✅ `X-Requested-With: XMLHttpRequest` header on both API clients

### Data Integrity
- ✅ Payment webhook signature verification (Razorpay)
- ✅ Payment idempotency guard (checks existing `gatewayPaymentId` before creating)
- ✅ Order creation wrapped in `prisma.$transaction()` with ReadCommitted isolation
- ✅ `SELECT ... FOR UPDATE` on session row prevents concurrent order race
- ✅ Order retry on P2002 unique constraint collision
- ✅ Idempotency middleware with Redis-backed 24h cache
- ✅ Payment amount validation (positive, max 10M, numeric check)

### Tenant Isolation
- ✅ All services consistently include `restaurantId` in WHERE clauses
- ✅ `staffManagementService` now validates `restaurantId` on shift CRUD
- ✅ Upload handler prefixes filenames with restaurantId and validates ownership
- ✅ Path traversal prevention with `path.basename()` + `resolvedPath.startsWith()` check
- ✅ Branch filtering uses correct `OR` pattern for nullable `branchId`

### Frontend
- ✅ Admin uses DOMPurify for HTML sanitization
- ✅ Session token rotation for QR abuse prevention
- ✅ Idempotency keys sent with order creation
- ✅ Payment verification happens server-side (not trusting client callback)
- ✅ Geo-fence coordinates sent for server-side validation

### Infrastructure
- ✅ Helmet security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy)
- ✅ Zod-based environment variable validation
- ✅ Multi-stage Docker builds
- ✅ Non-root user in backend container (`nodejs:1001`)
- ✅ `dumb-init` for proper signal handling
- ✅ Healthchecks for Postgres, Redis, and backend
- ✅ Source maps disabled in production builds
- ✅ `.gitignore` properly excludes `.env`

### Code Quality
- ✅ 6 backend test suites with proper mocking
- ✅ Vitest with v8 coverage provider
- ✅ Minimal console statements (error-level only)
- ✅ Only 2 TODO comments in entire backend

---

## 6. Previous Audit — Resolved Issues

These issues from the March 5, 2026 audit have been **fixed**:

| Issue | Status |
|-------|--------|
| Missing `restaurantId` validation in `staffManagementService` (C-5) | ✅ **FIXED** — now validates `restaurantId` in `updateShift`, `deleteShift` |
| Race condition in concurrent order creation (C-2) | ✅ **FIXED** — `$transaction()` + `SELECT ... FOR UPDATE` |
| Payment webhook no idempotency guard (C-4) | ✅ **FIXED** — checks existing `gatewayPaymentId` before creating |
| CSRF protection absent | ✅ **FIXED** — `csrfProtection.ts` middleware on cookie endpoints |
| Idempotency middleware missing | ✅ **FIXED** — `idempotency.ts` middleware with Redis cache |
| Fire-and-forget promises | ✅ **FIXED** — `Promise.allSettled()` with individual failure logging |
| Upload delete missing authorization | ✅ **FIXED** — ownership check via restaurant prefix + role check |
| Upload path traversal risk | ✅ **FIXED** — `path.basename()` + startsWith validation |
| Missing rate limiters | ✅ **FIXED** — comprehensive rate limiters across auth, PIN, OTP, orders, coupons |
| `inventoryController` uses `(req as any).userId` | ✅ **FIXED** — now uses `req.user!.restaurantId` |
| Receipt controller missing restaurant validation | ✅ **FIXED** — service validates restaurantId |
| Admin API client missing CSRF header | ✅ **FIXED** — both `request()` and `requestRaw()` include `X-Requested-With` |
| Staff role escalation to OWNER | ✅ **FIXED** — defence-in-depth check blocks OWNER role assignment |

---

## 7. Prioritized Remediation Plan

### 🔴 BEFORE PRODUCTION (Must Fix)

| Priority | Issue | Effort | Risk if Skipped |
|----------|-------|--------|-----------------|
| 1 | Enable HTTPS/TLS (C-1) | 2h | PCI non-compliance, credential theft |
| 2 | Remove direct port exposure; route through nginx (C-2) | 1h | Security bypass, DDoS surface |
| 3 | Add missing database indexes (C-3) | 15min | 100x slower queries at scale |
| 4 | Change cascade deletes to Restrict + soft-delete (C-4) | 2h | Irreversible data loss |
| 5 | Fix customer `sanitize()` with DOMPurify (C-5) | 10min | XSS vulnerability |
| 6 | Add socket authentication for customer connections (C-6) | 1h | Information disclosure |
| 7 | Remove secret key inputs from settings form (C-7) | 30min | Secret key exposure |
| 8 | Move token rotation inside order transaction (C-8) | 30min | QR replay attack |

### 🟠 BEFORE NEXT RELEASE (High Priority)

| Priority | Issue | Effort |
|----------|-------|--------|
| 9 | Move discount recording inside transaction (H-3) | 30min |
| 10 | Add pessimistic locking to session merge (H-4) | 30min |
| 11 | Add nginx rate limiting (H-12) | 30min |
| 12 | Make session token mandatory in order creation (H-9) | 15min |
| 13 | Persist idempotency key in sessionStorage (H-10) | 20min |
| 14 | Add temporal indexes for session expiry (H-2) | 10min |
| 15 | Add container resource limits (H-17) | 15min |
| 16 | Fix CSP WebSocket origins (H-15) | 15min |
| 17 | Fix CORS to reject localhost in production (H-16) | 10min |
| 18 | Add client-side PIN brute force throttle (H-7) | 20min |
| 19 | Add branch validation to session transfer (H-13) | 15min |
| 20 | Make nginx non-root (H-14) | 15min |

### 🟡 PLANNED IMPROVEMENTS (Medium Priority)

| Priority | Issue | Effort |
|----------|-------|--------|
| 21 | Encrypt offline order queue PII (H-18) | 1h |
| 22 | Use sessionStorage for customer PII (M-2) | 15min |
| 23 | Add ESLint + Prettier across all packages | 1h |
| 24 | Add frontend test coverage (admin + customer) | Multi-sprint |
| 25 | Implement Redis TLS (M-11) | 1h |
| 26 | Add centralized logging (L-8) | 2h |
| 27 | Reduce API cache from 24h to 15min (M-13) | 5min |
| 28 | Validate persisted user on rehydration (M-18) | 20min |
| 29 | Add Zod validation to CRM query params | 20min |
| 30 | Complete `.env.example` documentation (L-10) | 15min |

---

*This audit supersedes BACKEND_SECURITY_AUDIT.md and FRONTEND_SECURITY_AUDIT.md (both dated March 5, 2026). Items marked as resolved in Section 6 have been verified via code review on March 10, 2026.*
