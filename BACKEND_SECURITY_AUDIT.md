# Backend Security & Code Quality Audit Report

**Date:** March 5, 2026  
**Scope:** `packages/backend/` — Full audit of all services, controllers, routes, middlewares, socket handlers, and Prisma schema  
**Auditor:** Automated code audit  
**Files Reviewed:** 80+ files across services/, controllers/, routes/, middlewares/, socket/, lib/, config/, validators/, prisma/

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **CRITICAL** | 5 |
| **HIGH** | 12 |
| **MEDIUM** | 18 |
| **LOW** | 8 |
| **INFO** | 6 |
| **POSITIVE** | 15 |
| **TOTAL** | 64 |

---

## Table of Contents

1. [CRITICAL Issues](#1-critical-issues)
2. [HIGH Severity Issues](#2-high-severity-issues)
3. [MEDIUM Severity Issues](#3-medium-severity-issues)
4. [LOW Severity Issues](#4-low-severity-issues)
5. [INFO / Improvement Suggestions](#5-info--improvement-suggestions)
6. [Prisma Schema Issues](#6-prisma-schema-issues)
7. [Positive Findings](#7-positive-findings-well-implemented)
8. [Prioritized Remediation Plan](#8-prioritized-remediation-plan)

---

## 1. CRITICAL Issues

### C-1: Socket.io Authentication Is Fail-Open for All Connections

**File:** `socket/index.ts` (lines 55–70)  
**Severity:** CRITICAL  
**Category:** Authentication Bypass

**Issue:** The Socket.io auth middleware silently continues when token verification fails, unless `socket.handshake.auth.requireAuth` is explicitly set. Any customer or attacker who omits the `requireAuth` flag connects as an unauthenticated socket and can then attempt to join rooms.

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (token) {
    try {
      const payload = jwt.verify(token as string, config.jwt.accessSecret) as AccessTokenPayload;
      socket.data.userId = payload.userId;
      socket.data.restaurantId = payload.restaurantId;
    } catch {
      // For admin connections that require auth, reject immediately
      if (socket.handshake.auth.requireAuth) {
        return next(new Error('Authentication failed'));
      }
      // Otherwise continue without auth (public customer connections)
    }
  }
  next(); // ALL connections pass through, even with no token at all
});
```

**Attack:** An attacker connects with no token at all → passes through → can call `join:group` with any code → can observe all group order events. The `requireAuth` flag is a client-side honor system; attackers will never set it.

**Recommended Fix:**
```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (token) {
    try {
      const payload = jwt.verify(token as string, config.jwt.accessSecret);
      socket.data.userId = payload.userId;
      socket.data.restaurantId = payload.restaurantId;
      socket.data.isAuthenticated = true;
    } catch {
      socket.data.isAuthenticated = false;
    }
  } else {
    socket.data.isAuthenticated = false;
  }
  next(); // Still allow customer connections...
});

// Then in join:restaurant handler, check socket.data.isAuthenticated
// In join:group, require at least a valid group code + rate limit
```

---

### C-2: Race Condition — Concurrent Order Creation (Duplicate Orders)

**File:** `services/orderService.ts` (lines ~258–300)  
**Severity:** CRITICAL  
**Category:** Race Condition / Data Integrity

**Issue:** The `createOrder()` method has no pessimistic locking. Two concurrent requests for the same table can both succeed, creating duplicate orders. The only retry logic handles `P2002` unique constraint on the order number — it does NOT prevent two orders from being successfully created simultaneously.

**Recommended Fix:** Use `SELECT ... FOR UPDATE` on the table row within a `$transaction` before creating the order, or add an application-level distributed lock using Redis.

---

### C-3: Race Condition — Session Token Reuse in Group Orders

**File:** `services/groupOrderService.ts` (lines ~265–275)  
**Severity:** CRITICAL  
**Category:** Race Condition

**Issue:** Session token is rotated AFTER order submission completes. During the window between order creation and token rotation, a stale QR scan with the old token can initiate a new order or group.

**Recommended Fix:** Rotate session token BEFORE submitting the order within the same transaction.

---

### C-4: Payment Webhook Has No Idempotency Guard

**File:** `services/paymentGatewayService.ts` (lines ~85–130)  
**Severity:** CRITICAL  
**Category:** Data Integrity / Double-Charge

**Issue:** `verifyAndRecordPayment()` always creates a new `Payment` record. If Razorpay retries the webhook (common on network issues), duplicate payment records are created. While there is a unique index on `gatewayPaymentId`, it was added later and the service code does NOT check for existing payments before creating.

**Recommended Fix:** Use an upsert pattern or check for existing payment with the same `gatewayPaymentId` before creating:
```typescript
const existing = await prisma.payment.findUnique({
  where: { gatewayPaymentId: data.gatewayPaymentId },
});
if (existing) return existing; // Already processed
```

---

### C-5: Staff Management — Missing Tenant Isolation on Mutations

**File:** `services/staffManagementService.ts` (lines 46–56)  
**Severity:** CRITICAL  
**Category:** Broken Access Control

**Issue:** `updateShift()` and `deleteShift()` accept only the shift ID without validating that the shift belongs to the caller's restaurant:

```typescript
async updateShift(shiftId: string, data: { ... }) {
  return prisma.staffShift.update({
    where: { id: shiftId },  // NO restaurantId check!
    data,
  });
},

async deleteShift(shiftId: string) {
  return prisma.staffShift.delete({ where: { id: shiftId } });  // NO restaurantId check!
},
```

Similarly, `removeAssignment()` has no tenant check. An authenticated user from Restaurant A can delete shifts belonging to Restaurant B by guessing the UUID.

**Recommended Fix:** Always include `restaurantId` in the `where` clause:
```typescript
async deleteShift(shiftId: string, restaurantId: string) {
  const shift = await prisma.staffShift.findFirst({ where: { id: shiftId, restaurantId } });
  if (!shift) throw AppError.notFound('Shift');
  return prisma.staffShift.delete({ where: { id: shiftId } });
},
```

---

## 2. HIGH Severity Issues

### H-1: Missing `restaurantId` Validation in `getOrderById()`

**File:** `services/orderService.ts` (lines ~170–180)  
**Severity:** HIGH  
**Category:** Broken Access Control / Tenant Isolation

**Issue:** `getOrderById()` accepts optional `restaurantId`. When called from admin routes, `req.restaurantId` is always set. But if called from the public order status route (`/api/public/orders/:id/status`), there's no restaurant context — any order is fetchable by ID.

```typescript
// In orderController.getOrderById:
const restaurantId = req.restaurantId; // Could be undefined on public routes
const order = await orderService.getOrderById(req.params.id, restaurantId);
```

**Recommended Fix:** For public routes, always require an additional identifier (tableId, sessionToken) to prove ownership. For admin routes, make `restaurantId` mandatory.

---

### H-2: Upload Delete — Missing Authorization Check

**File:** `routes/upload.ts` (lines 40–70)  
**Severity:** HIGH  
**Category:** Broken Access Control

**Issue:** The `DELETE /upload/image/:filename` endpoint only requires `authenticate` but no `authorize()` role check. ANY authenticated staff member (including STAFF role) can delete ANY uploaded image from ANY restaurant — the delete handler doesn't verify the image belongs to the caller's restaurant.

```typescript
router.delete('/image/:filename', authenticate, (req, res) => {
  // No restaurantId check on which restaurant owns the image
  // No role check — STAFF can delete owner's images
  const safeFilename = path.basename(filename);
  fs.unlinkSync(resolvedPath); // Deletes from shared uploads directory
});
```

**Recommended Fix:** Add `authorize('OWNER', 'ADMIN', 'MANAGER')` and/or track image ownership in the database.

---

### H-3: Group Order Join Has No Rate Limiting or CAPTCHA

**File:** `routes/public.ts` (group order section)  
**Severity:** HIGH  
**Category:** Abuse / Denial of Service

**Issue:** The group order `join` endpoint has no rate limiting. An attacker can flood a group order with thousands of fake participants:

```typescript
router.post('/group/:code/join', validate(joinGroupSchema), groupOrderController.join);
// No rate limiter applied!
```

**Recommended Fix:** Add `orderLimiter` or a group-specific rate limiter to the join endpoint.

---

### H-4: Session Transfer — Non-Atomic Multi-Step Operation

**File:** `services/sessionService.ts` (lines ~350–420)  
**Severity:** HIGH  
**Category:** Data Integrity

**Issue:** Session transfer involves multiple sequential database operations (mark source as TRANSFERRED, create new session, move orders) that are not wrapped in a single atomic transaction. If the process crashes mid-transfer, orders can be orphaned.

**Recommended Fix:** Wrap the entire transfer logic in a single `prisma.$transaction()` call.

---

### H-5: Missing Inventory Deduction on Order Completion

**File:** `services/orderService.ts`  
**Severity:** HIGH  
**Category:** Missing Business Logic

**Issue:** The entire `orderService.ts` file has no inventory deduction logic. When orders are created or completed, ingredient stock levels are never decremented. The inventory system exists but is completely disconnected from order flow.

**Recommended Fix:** After order status changes to COMPLETED (or PREPARING), deduct ingredients based on `Recipe` table linkages.

---

### H-6: Fire-and-Forget Operations Causing Memory Leaks

**File:** `services/orderService.ts` (lines ~410–430)  
**Severity:** HIGH  
**Category:** Reliability / Memory Leak

**Issue:** Post-order operations (cache invalidation, table status update, usage recording) are pushed into a `Promise[]` array but never awaited. If any hangs, the promise remains in memory indefinitely.

**Recommended Fix:** Use `Promise.allSettled()` with a timeout wrapper, or move post-order operations to a background job queue.

---

### H-7: Public Restaurant Route Exposes All Restaurant Data

**File:** `controllers/restaurantController.ts` → `getById()`  
**Severity:** HIGH  
**Category:** Data Leakage

**Issue:** The `GET /api/public/:id` route returns the full restaurant object from `restaurantService.getById()` including internal settings, tax rate, and potentially sensitive configuration. Unlike `getRestaurant()` which strips `lockPin`, `getById()` does not strip sensitive data.

```typescript
async getById(req, res, next) {
  const restaurant = await restaurantService.getById(req.params.id);
  res.json({ success: true, data: restaurant }); // Full internal data exposed
},
```

**Recommended Fix:** Create a `getPublicById()` method that returns only public-safe fields (name, slug, coverImage, address, isActive, currency).

---

### H-8: Payment Routes Missing Authentication for Webhook

**File:** `routes/payments.ts`  
**Severity:** HIGH  
**Category:** Authentication Bypass

**Issue:** The payment routes file applies `router.use(authenticate)` at the top, which means the webhook endpoint `POST /api/payments/webhook` also requires a JWT token. But webhooks come from Razorpay's servers — they don't have JWTs. This means either: (a) the webhook endpoint is broken, or (b) there's another route handling it. Checking `app.ts`, the webhook is handled via raw body middleware at `/api/payment/webhook` (singular), but the route in `payments.ts` also defines `/webhook` under the authenticated router.

The webhook in `public.ts` or the direct raw body route is the actual working one, but having a webhook endpoint behind `authenticate` is confusing and suggests the webhook path at `/api/payments/webhook` would silently fail with a 401.

**Recommended Fix:** Remove the webhook route from `payments.ts` (the authenticated payments router) and ensure it's only handled in the unauthenticated context with proper signature verification.

---

### H-9: `inventoryController` Uses `(req as any).userId` — Always Undefined

**File:** `controllers/inventoryController.ts` (lines 60, 85, etc.)  
**Severity:** HIGH  
**Category:** Bug / Missing Data

**Issue:** Multiple inventory controller methods access `(req as any).userId` for audit logging:

```typescript
const userId = (req as any).userId; // undefined! Should be req.user?.id
```

The Express `Request` type has `req.user.id`, not `req.userId`. This means all stock adjustments, usage records, and purchase orders are created with `performedBy: undefined`, losing audit trail data.

**Recommended Fix:** Change to `req.user?.id` or `req.user!.id`.

---

### H-10: Receipt Controller — No Restaurant Validation

**File:** `controllers/receiptController.ts`  
**Severity:** HIGH  
**Category:** Broken Access Control

**Issue:** `send()` and `listByOrder()` take `orderId` from params but never validate that the order belongs to the caller's restaurant. An authenticated user from Restaurant A can send receipts for or view receipts of Restaurant B's orders.

**Recommended Fix:** Add `restaurantId` check when fetching the order.

---

### H-11: Service Request Acknowledge/Resolve — Missing Role Check

**File:** `routes/features.ts` (lines 11–13)  
**Severity:** HIGH  
**Category:** Missing Authorization

**Issue:** The service request acknowledge and resolve endpoints require `authenticate` but no `authorize()`:

```typescript
router.patch('/service-requests/:id/acknowledge', authenticate, validate(idParamSchema, 'params'), serviceRequestController.acknowledge);
router.patch('/service-requests/:id/resolve', authenticate, validate(idParamSchema, 'params'), serviceRequestController.resolve);
```

Any authenticated STAFF member can acknowledge/resolve service requests. This may be intentional (waiters should be able to acknowledge), but there's no role check at all — even a STAFF from a different restaurant could potentially acknowledge requests if the service doesn't validate `restaurantId`.

**Recommended Fix:** Add at minimum `authorize('OWNER', 'ADMIN', 'MANAGER', 'STAFF')` for explicit documentation, and ensure the service validates `restaurantId`.

---

### H-12: CRM Controller — No Input Validation on Query Params

**File:** `controllers/crmController.ts` (lines 7–18)  
**Severity:** HIGH  
**Category:** Missing Input Validation

**Issue:** Query parameters are passed directly to the service without Zod validation:

```typescript
const result = await crmService.getCustomers(restaurantId, {
  page: page ? Number(page) : undefined,
  limit: limit ? Number(limit) : undefined, // No max limit — could request limit=999999
  search: search as string | undefined,      // No sanitization
  tags: tags ? (tags as string).split(',') as CustomerTag[] : undefined, // No enum validation
  sortBy: sortBy as 'totalSpend' | ... | undefined, // Type assertion without validation
  sortOrder: sortOrder as 'asc' | 'desc' | undefined,
});
```

An attacker could pass `sortBy=password` or `limit=1000000` to cause DB performance issues or potentially access unexpected columns.

**Recommended Fix:** Create a Zod validation schema for CRM query params and use the `validate()` middleware.

---

## 3. MEDIUM Severity Issues

### M-1: CORS Origin From Single Environment Variable

**File:** `config/index.ts` (line 73)  
**Severity:** MEDIUM  
**Category:** Security Misconfiguration

**Issue:** CORS origins are split from a single `CORS_ORIGIN` env var:
```typescript
origin: parsed.data.CORS_ORIGIN.split(','),
```

Default is `http://localhost:5173`. If `CORS_ORIGIN` is misconfigured in production (e.g., contains `*` or a trailing comma), all origins would be allowed. The default should NOT be set for production.

**Recommended Fix:** In production, require explicit CORS_ORIGIN with no default value.

---

### M-2: Refresh Token Cookie Missing `domain` Setting

**File:** `controllers/authController.ts` (lines 8–13)  
**Severity:** MEDIUM  
**Category:** Cookie Security

**Issue:** The refresh token cookie has `secure: config.isProduction` and `sameSite: 'lax'` but no explicit `domain`. If the admin and customer apps are on different subdomains, the cookie scope may be wider than intended. Also, `secure: false` in development means the cookie is sent over HTTP — expected for local dev but should be documented.

---

### M-3: CSRF Protection Not Applied to Many State-Changing Routes

**File:** `middlewares/csrfProtection.ts` + `routes/*.ts`  
**Severity:** MEDIUM  
**Category:** CSRF

**Issue:** CSRF protection is only applied to `/auth/refresh` and `/auth/logout`. All other state-changing routes (order creation, profile updates, restaurant settings) rely solely on the Bearer token in the Authorization header. Since Bearer tokens must be explicitly added via JavaScript (not auto-sent by browsers), CSRF is largely mitigated — but the refresh endpoint uses cookies, making it the primary CSRF target. The current protection there is correct, but the inconsistency should be documented.

---

### M-4: Geo-Fence Validation Fails Open on Error

**File:** `middlewares/geoValidation.ts` (lines ~130–138)  
**Severity:** MEDIUM  
**Category:** Security Degradation

**Issue:** If the geo-fence check throws an error (e.g., database timeout), the middleware logs a warning and calls `next()`, allowing the order through:

```typescript
.catch((err) => {
  logger.error({ err, restaurantId }, 'Geo-fence check failed — allowing request (service degradation)');
  next(); // Fail-open
});
```

This is by design (availability over security), but an attacker could deliberately cause Redis/DB issues to bypass geo-fencing.

**Recommended Fix:** Add a config flag for fail-closed vs fail-open behavior. Log a metric for ops alerting.

---

### M-5: Table Rate Limiter Fails Open

**File:** `middlewares/tableRateLimiter.ts` (lines 44–47)  
**Severity:** MEDIUM  
**Category:** Security Degradation

**Issue:** When Redis is unavailable, the table rate limiter silently allows all requests:

```typescript
} catch (err) {
  logger.error({ err, tableId }, 'Table rate-limiter Redis error — skipping');
}
next(); // Always continues
```

---

### M-6: Report Controller — Date Params Not Validated

**File:** `controllers/reportController.ts` (lines 4–8)  
**Severity:** MEDIUM  
**Category:** Input Validation

**Issue:** `parseDateRange()` passes raw query strings to `new Date()` without validation:

```typescript
function parseDateRange(query: Record<string, unknown>) {
  const startDate = query.startDate ? new Date(query.startDate as string) : ...;
  const endDate = query.endDate ? new Date(query.endDate as string) : now;
}
```

If `startDate=invalid`, `new Date('invalid')` returns `Invalid Date`. This is then passed to Prisma raw SQL queries, potentially causing unexpected behavior.

**Recommended Fix:** Validate dates with Zod or check for `isNaN(startDate.getTime())`.

---

### M-7: Staff Role Escalation — Manager Can Promote to Admin

**File:** `services/staffService.ts` (lines ~44–75)  
**Severity:** MEDIUM  
**Category:** Privilege Escalation

**Issue:** The staff routes are protected by `authorize('OWNER')`, but the `staffService.update()` method only checks that you can't modify an OWNER. If the route authorization were ever loosened to include MANAGER, a MANAGER could promote anyone to ADMIN.

**Recommended Fix:** Add explicit role hierarchy check in the service: only OWNER can set role to ADMIN or MANAGER.

---

### M-8: Sensitive Data in Error Logs

**File:** `services/emailService.ts` (line ~100)  
**Severity:** MEDIUM  
**Category:** Data Leakage

**Issue:** Email addresses are logged in plain text when sending fails. Logger redaction paths cover `password`, `token` etc. but not `email`, `to`, or `recipient`.

**Recommended Fix:** Add `'*.email'`, `'to'`, `'recipient'` to the pino redact paths.

---

### M-9: Missing Rate Limiting on Sensitive Endpoints

**Severity:** MEDIUM  
**Category:** Missing Rate Limiting

**Issue:** Several sensitive endpoints lack dedicated rate limiting:

| Endpoint | Risk |
|----------|------|
| `PATCH /api/staff/:id` | Brute-force role changes |
| `POST /api/public/group` | Group order flooding |
| `POST /api/public/group/:code/join` | Participant flooding |
| `POST /api/public/r/:slug/orders` (has rate limiter) | ✓ OK |
| `DELETE /api/upload/image/:filename` | Image deletion DoS |
| `POST /api/public/:restaurantId/feedback` | Feedback spam |
| `POST /api/public/:restaurantId/service-request` | Service request spam |

---

### M-10: Idempotency Key Scoping

**File:** `middlewares/idempotency.ts`  
**Severity:** MEDIUM  
**Category:** Data Integrity

**Issue:** The idempotency key is not scoped to a specific user/restaurant. Key `abc123` from Restaurant A would return the cached response if Restaurant B sends the same key. This could leak response data across tenants.

**Recommended Fix:** Prefix the key with a user/restaurant identifier:
```typescript
const redisKey = `${KEY_PREFIX}${req.restaurantId || req.ip}:${key}`;
```

---

### M-11: Authentication Cache TTL — Stale User Data for 60s

**File:** `middlewares/auth.ts` (lines 44–50)  
**Severity:** MEDIUM  
**Category:** Stale Authorization

**Issue:** User data (including `isActive` and `role`) is cached for 60 seconds. If an admin deactivates a user or changes their role, the changes won't take effect for up to 60 seconds. During this window, a deactivated/demoted user retains their previous access.

**Recommended Fix:** When deactivating a user, invalidate the cache key `auth:user:{userId}`. Or reduce TTL to 10-15 seconds.

---

### M-12: `resolveBranch` Silently Falls Back to All Branches

**File:** `middlewares/resolveBranch.ts`  
**Severity:** MEDIUM  
**Category:** Fail-Open

**Issue:** If a branch ID header is provided but the branch doesn't belong to the user's restaurant, the middleware silently falls back to `null` (all branches) instead of returning a 403:

```typescript
req.branchId = branch ? branch.id : null; // Falls back to ALL branches
```

An attacker could send an invalid branch header and get data from ALL branches instead of being rejected.

**Recommended Fix:** Return 403 if a branch ID is provided but doesn't belong to the restaurant.

---

### M-13: Webhook Signature Verification — Timing Attack

**File:** `services/payment/razorpayProvider.ts` (lines 50–57)  
**Severity:** MEDIUM  
**Category:** Cryptographic Implementation

**Issue:** Signature comparison uses `===` which is vulnerable to timing attacks:

```typescript
return expectedSignature === params.gatewaySignature;
```

**Recommended Fix:** Use `crypto.timingSafeEqual()`:
```typescript
return crypto.timingSafeEqual(
  Buffer.from(expectedSignature),
  Buffer.from(params.gatewaySignature)
);
```

---

### M-14: Hardcoded Session Timeouts

**File:** `services/sessionService.ts` (lines ~8–10)  
**Severity:** MEDIUM  
**Category:** Configuration

**Issue:** Session maxDuration (90 min) and inactivity timeout (15 min) cannot be adjusted without code changes. Different restaurants need different timeouts.

---

### M-15: Group Order TTL Hardcoded

**File:** `services/groupOrderService.ts` (line ~16)  
**Severity:** MEDIUM  
**Category:** Configuration

**Issue:** `GROUP_TTL_MS = 2 * 60 * 60 * 1000` (2 hours) is hardcoded.

---

### M-16: Discount Validation — Missing Time Window Constraints

**File:** `services/discountService.ts` (lines ~55–75)  
**Severity:** MEDIUM  
**Category:** Business Logic

**Issue:** A discount with ALL null time constraints (`activeFrom`, `activeTo`, `activeDays`, `activeTimeFrom`, `activeTimeTo`) is treated as "always valid". An admin could accidentally create an always-valid discount. No minimum constraint validation exists.

---

### M-17: CRM `updateCustomer` — No Input Validation Schema

**File:** `controllers/crmController.ts` → `updateCustomer`  
**Severity:** MEDIUM  
**Category:** Input Validation

**Issue:** The update customer endpoint passes `req.body` directly to the service without validation:

```typescript
const customer = await crmService.updateCustomer(req.params.id!, req.user!.restaurantId, req.body);
```

An attacker could send arbitrary fields like `{ totalSpend: 999999 }` and potentially modify sensitive CRM data.

---

### M-18: `getPublicOrderStatus` Returns Order Data Without Strong Auth

**File:** `routes/public.ts` + `controllers/orderController.ts`  
**Severity:** MEDIUM  
**Category:** Information Disclosure

**Issue:** `GET /api/public/orders/:id/status` returns order status by UUID. While UUIDs are hard to guess, once known (e.g., from socket events or session storage), anyone can poll the status of any order without authenticating. The `stripCustomerPII` function removes name/phone, which is good, but the order items, total, and table info are still exposed.

---

## 4. LOW Severity Issues

### L-1: OTP Rate Limiting Hardcoded

**File:** `services/otpService.ts` (lines ~47–48)  
**Severity:** LOW

`OTP_MAX_ATTEMPTS = 5` and `OTP_RATE_WINDOW = 600` are hardcoded. Should be environment variables.

---

### L-2: Inconsistent Error Handling in Controllers

**Severity:** LOW

Most controllers use `try/catch` with `next(error)`, which is correct. But some use `next(err)` while catching less specific `err`. This works fine functionally but is inconsistent.

---

### L-3: Missing `id` Param Validation on Some Routes

**File:** `routes/inventory.ts`, `routes/staffManagement.ts`  
**Severity:** LOW

Several route params (`:id`, `:ingredientId`, `:supplierId`) are not validated with `validate(idParamSchema, 'params')`. While Prisma will reject non-UUID strings, the error message would be a generic database error rather than a clear validation error.

---

### L-4: Console.log in Production — Redis Module

**File:** `lib/redis.ts` (lines 28–30)  
**Severity:** LOW

Redis events use `console.error` and `console.log` instead of the structured `logger`:

```typescript
redis.on('error', (err) => {
  console.error('Redis connection error:', err); // Should use logger
});
```

This is documented as avoiding circular dependencies, which is a valid reason, but in production these won't be captured by the structured logging pipeline.

---

### L-5: `trust proxy` Set to 1 Globally

**File:** `app.ts` (line 70)  
**Severity:** LOW

`app.set('trust proxy', 1)` trusts the first proxy hop. This is correct for single-proxy setups (nginx, ALB) but could be wrong for multi-proxy chains, causing incorrect client IP resolution for rate limiting.

---

### L-6: Periodic Cleanup Intervals Not Cleared on Shutdown

**File:** `index.ts`  
**Severity:** LOW

The `setInterval` calls for token cleanup and session expiry are never cleared during graceful shutdown. This can cause a "timer still running after tests finish" issue in test environments.

---

### L-7: `orderQuerySchema` Allows `limit` up to 500

**File:** `validators/index.ts`  
**Severity:** LOW

`limit: z.coerce.number().int().min(1).max(500).default(50)` — Allowing 500 orders per page could cause performance issues on large restaurants.

---

### L-8: Payment Amount Max of 10,000,000 — No Currency-Specific Limit

**File:** `controllers/paymentGatewayController.ts`  
**Severity:** LOW

Maximum payment of 10M for all currencies. This is ₹1,00,00,000 INR (reasonable) but €10M EUR (unreasonable). Should be currency-specific.

---

## 5. INFO / Improvement Suggestions

### I-1: Error Handler Leaks Prisma Meta in Development

**File:** `middlewares/errorHandler.ts` (line 47)

For P2002 errors, `err.meta` is included when `config.isDevelopment`:
```typescript
details: config.isDevelopment ? err.meta : undefined,
```
This is fine for development but ensure `isDevelopment` is never accidentally true in production.

---

### I-2: Unvalidated `req.body.branchId` in Payment Verification

**File:** `controllers/paymentGatewayController.ts` → `verifyPayment()`

The `branchId` from `req.body` is passed through without validation. If invalid, it would be stored in the payment record.

---

### I-3: In-Memory Geo Cache Has No Size Limit

**File:** `middlewares/geoValidation.ts` (line 36)

The `geoCache` Map grows indefinitely. If there are thousands of restaurants, this could consume significant memory. Consider using an LRU cache or bounding the map size.

---

### I-4: No Health Check for Redis

**File:** `routes/index.ts` → `/api/health`

The health endpoint returns `{ status: 'ok' }` without checking Redis or database connectivity. For production load balancer health checks, this should verify downstream dependencies.

---

### I-5: Socket Rate Limiter Uses Generic Key

**File:** `socket/index.ts` (line 23)

The socket rate limiter uses `socket.id` as the key. Socket IDs change on reconnection, so a malicious client can reconnect to bypass rate limits.

**Better key:** Use IP address or a combination of IP + table ID.

---

### I-6: No Request/Response Size Limits on Socket Events

**File:** `socket/index.ts`

Socket events like `payment:request` accept arbitrary payload sizes. A malicious client could send very large payloads to consume memory.

---

## 6. Prisma Schema Issues

### P-1: Missing Foreign Key Index on `ServiceRequest.restaurantId`

**Severity:** MEDIUM

`ServiceRequest` has `restaurantId` as a raw string field (not a relation) with a composite index on `[restaurantId, status]`, but no `Restaurant` relation. This means:
1. No referential integrity — restaurant can be deleted with orphaned service requests
2. No cascade delete behavior

**Recommended Fix:** Add a proper relation: `restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)`

---

### P-2: Missing Relations on Staff Management Tables

**Severity:** MEDIUM

`StaffShift`, `ShiftAssignment`, `Attendance`, `LeaveRequest`, and `PayrollConfig` all have `restaurantId` as raw strings without a `Restaurant` relation. Same for `userId` fields — they reference `User` by ID but have no Prisma relation. This means:

1. No referential integrity enforcement
2. No cascade deletes
3. Raw string IDs allow orphaned records

---

### P-3: `Feedback.sessionId` Is an Unreferenced String

**Severity:** LOW

`Feedback.sessionId` is declared as `String?` with no relation to `TableSession`. This is a dangling foreign key.

---

### P-4: `User.email` Is Optional But Used for Login

**Severity:** MEDIUM

`email String?` allows null emails, but the auth flow requires email for registration and verification. Staff created via the staff management flow may have no email, which could cause issues if they try to use email-based features.

The `@@index([email])` index on a nullable column means null values are included in the index, which is fine for PostgreSQL but should be noted.

---

### P-5: `Order` Unique Constraint on `[restaurantId, branchId, orderNumber]`

**Severity:** LOW

The order number uniqueness includes `branchId`, which is optional. Two different branches (or null branch) could technically have the same order number IF `branchId` differs. In PostgreSQL, null values in a unique constraint are always distinct, so `(restaurantId, null, 'O-001')` and `(restaurantId, null, 'O-001')` would NOT conflict. This means duplicate order numbers for non-branch orders are possible.

---

### P-6: Missing Index on `Order.gatewayOrderId`

**Severity:** LOW

`gatewayOrderId` is queried during payment verification but has no index. For restaurants with many orders, this could cause slow lookups.

---

## 7. Positive Findings (Well-Implemented)

These patterns demonstrate good security practices already present in the codebase:

| # | Area | Finding |
|---|------|---------|
| ✅ 1 | **Config Validation** | Environment variables validated with Zod schema on startup. Missing required vars fail fast with clear messages. |
| ✅ 2 | **Helmet + CSP** | Full Content-Security-Policy headers with `frame-ancestors: 'none'`, `object-src: 'none'`, proper script-src for dev/prod. |
| ✅ 3 | **Rate Limiting** | Multiple tier rate limiters (global API, auth, order, PIN, OTP, coupon, table-based) with Redis-backed stores and MemoryStore fallback. |
| ✅ 4 | **JWT Architecture** | Short-lived access tokens (15m) + long-lived refresh tokens in HttpOnly cookies. SHA-256 hashed refresh tokens stored in DB. Proper token rotation. |
| ✅ 5 | **Password Hashing** | bcryptjs with proper password complexity requirements (upper, lower, digit, 8+ chars). |
| ✅ 6 | **SQL Injection Protection** | All database queries use Prisma ORM parameterized queries. Raw SQL in reportService uses `Prisma.sql` template literals for safe interpolation. |
| ✅ 7 | **Input Validation** | Comprehensive Zod schemas for all major inputs (auth, orders, menu, tables, discounts). The `validate()` middleware replaces `req.body` with parsed data. |
| ✅ 8 | **Path Traversal Protection** | Upload delete route uses `path.basename()` + resolved path check to prevent directory traversal attacks. |
| ✅ 9 | **Error Handling** | Centralized error handler distinguishes AppError, ZodError, and PrismaError. Production mode hides internal error messages. |
| ✅ 10 | **Log Redaction** | Pino logger redacts `password`, `passwordHash`, `token`, `refreshToken`, `accessToken`, `authorization` fields. |
| ✅ 11 | **Webhook Signature Verification** | Razorpay webhook validates HMAC-SHA256 signature before processing. Raw body captured separately for verification. |
| ✅ 12 | **CSRF on Cookie Endpoints** | Origin-based CSRF protection applied to refresh and logout (the only cookie-authenticated endpoints). |
| ✅ 13 | **Graceful Shutdown** | Proper SIGTERM/SIGINT handlers that close HTTP server, disconnect Prisma, and quit Redis. Force-exit after 10s timeout. |
| ✅ 14 | **Socket Room Validation** | `join:table` and `order:join` validate that the table/order exists and has an active session before allowing a socket to join the room. |
| ✅ 15 | **Session Token Rotation** | Tables have a `sessionToken` that rotates when a session ends, preventing stale QR code reuse. |

---

## 8. Prioritized Remediation Plan

### 🔴 Immediate (Fix Within 24–48 Hours)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| C-5 | Staff management missing tenant isolation | Low | Data breach across restaurants |
| C-4 | Payment webhook idempotency | Low | Duplicate payments |
| C-1 | Socket.io fail-open auth | Medium | Event spoofing, data leakage |
| H-9 | inventoryController uses wrong userId field | Low | Missing audit trail |
| H-2 | Upload delete missing authorization | Low | Cross-tenant image deletion |
| H-1 | getOrderById optional restaurantId | Low | Cross-tenant data access |

### 🟠 Short-Term (Fix Within 1 Week)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| C-2 | Race condition on order creation | Medium | Duplicate orders |
| C-3 | Session token reuse in group orders | Medium | Multiple concurrent orders |
| H-4 | Session transfer non-atomic | Medium | Orphaned orders |
| H-5 | Missing inventory deduction | High | Inventory data inaccurate |
| H-7 | Public restaurant route data leakage | Low | Settings disclosure |
| H-8 | Payment webhook route confusion | Low | Silent failures |
| H-10 | Receipt controller missing restaurant check | Low | Cross-tenant access |
| H-12 | CRM missing input validation | Medium | Injection/DoS |
| M-10 | Idempotency key not scoped to tenant | Low | Cross-tenant cache collision |
| M-13 | Timing attack on webhook signature | Low | Webhook compromise |

### 🟡 Medium-Term (Fix Within 2–4 Weeks)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| H-3 | Group order join rate limiting | Low | DoS |
| H-6 | Fire-and-forget memory leak | Medium | OOM crash |
| H-11 | Service request missing role check | Low | Unauthorized access |
| M-1 to M-18 | Various medium issues | Variable | Various |
| P-1, P-2 | Schema relation gaps | Medium | Data integrity |

### 🟢 Low Priority (Technical Debt Backlog)

| # | Issue | Effort |
|---|-------|--------|
| L-1 to L-8 | Hardcoded configs, inconsistencies | Low |
| P-3 to P-6 | Schema improvements | Low |
| I-1 to I-6 | Info/improvement suggestions | Low |

---

## Appendix: Files Reviewed

### Middlewares (12 files)
- `auth.ts` — JWT authentication + role authorization
- `csrfProtection.ts` — Origin-based CSRF
- `errorHandler.ts` — Centralized error handler
- `geoValidation.ts` — Haversine geo-fence
- `idempotency.ts` — Redis-backed idempotency keys
- `rateLimiter.ts` — Multi-tier rate limiters
- `resolveBranch.ts` — Branch context resolution
- `resolveRestaurant.ts` — Restaurant slug resolution
- `tableRateLimiter.ts` — Per-table rate limiting
- `upload.ts` — Multer image upload
- `validate.ts` — Zod validation middleware
- `index.ts` — Barrel exports

### Routes (20 files)
- `auth.ts`, `branches.ts`, `crm.ts`, `discounts.ts`, `features.ts`, `inventory.ts`, `menu.ts`, `orders.ts`, `payments.ts`, `profile.ts`, `public.ts`, `reports.ts`, `restaurant.ts`, `sections.ts`, `sessions.ts`, `staff.ts`, `staffManagement.ts`, `tables.ts`, `upload.ts`, `index.ts`

### Controllers (21 files)
- `authController.ts`, `branchController.ts`, `crmController.ts`, `discountController.ts`, `feedbackController.ts`, `groupOrderController.ts`, `inventoryController.ts`, `menuController.ts`, `orderController.ts`, `otpController.ts`, `paymentGatewayController.ts`, `profileController.ts`, `receiptController.ts`, `reportController.ts`, `restaurantController.ts`, `sectionController.ts`, `serviceRequestController.ts`, `sessionController.ts`, `staffManagementController.ts`, `tableController.ts`, `index.ts`

### Services (28 files)
- All 26 service files + `payment/razorpayProvider.ts` + `payment/types.ts`

### Other files
- `app.ts`, `index.ts`, `config/index.ts`, `lib/prisma.ts`, `lib/redis.ts`, `lib/errors.ts`, `lib/logger.ts`, `types/index.ts`, `validators/index.ts`, `socket/index.ts`, `prisma/schema.prisma`
