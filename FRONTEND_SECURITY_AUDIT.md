# Frontend Security & Code Quality Audit

**Scope:** `packages/admin/src/` and `packages/customer/src/`  
**Date:** 2026-03-05  
**Auditor:** Automated deep-code review

---

## Executive Summary

The admin and customer frontends are **generally well-architected** with several strong security patterns already in place. The most critical issues relate to missing CSRF headers in the admin API client, the Razorpay secret key traversing the frontend, and the customer `sanitize()` utility being a no-op. Overall severity is moderate — no critical XSS or injection vectors were found in source code.

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 8     |
| LOW      | 6     |
| INFO     | 7     |

---

## CRITICAL Issues

### C-1 · Razorpay Secret Key Exposed to Browser
- **File:** `admin/src/pages/SettingsPage.tsx` (FormState), `admin/src/services/settingsService.ts` (SettingsPayload)
- **Severity:** CRITICAL
- **Description:** The `razorpayKeySecret` is stored in the admin form state, sent to the backend via the settings update payload, and can be read from the settings GET response. While the backend may redact it, the frontend type definitions and form bindings (`razorpayKeySecret` in `FormState`) imply the secret is round-tripped through the client. Payment gateway secrets must **never** leave the server.
- **Fix:** (1) Backend must never return `razorpayKeySecret` in GET responses — return a masked placeholder like `"rzp_secret_****"`. (2) Frontend should only *send* the secret on update, never display or read it. Add a `writeOnly` input pattern (clear on load, only send if changed). (3) Remove `razorpayKeySecret` from the `settingsService.get()` response type.

### C-2 · Admin API Client Missing CSRF Protection Header
- **File:** `admin/src/services/apiClient.ts`
- **Severity:** CRITICAL
- **Description:** The customer API client sends `X-Requested-With: XMLHttpRequest` as a basic CSRF guard, but the admin API client omits this entirely. Since the admin app uses `credentials: 'include'` with cookie-based auth, the admin panel is vulnerable to cross-site request forgery attacks from malicious websites (e.g., an attacker page could trigger state-changing API calls using the admin's cookies).
- **Fix:** Add `'X-Requested-With': 'XMLHttpRequest'` to the default headers in both `request()` and `requestRaw()` methods of the admin `ApiClient`. Ensure the backend validates this header on all state-changing endpoints.

---

## HIGH Issues

### H-1 · Customer `sanitize()` Is a No-Op
- **File:** `customer/src/utils/sanitize.ts`
- **Severity:** HIGH
- **Description:** The `sanitize()` function is documented as stripping HTML but returns the input string unchanged: `return value`. The code comment says "React auto-escapes text nodes" — which is true for JSX interpolation (`{value}`) but not for attribute contexts or if `dangerouslySetInnerHTML` is ever introduced. The admin package correctly uses DOMPurify; the customer package does not.
- **Fix:** Either make the function a real sanitizer using DOMPurify (matching the admin package), or audit every call site to confirm no value is ever used outside of JSX text interpolation. Given defensive-in-depth, DOMPurify is recommended.

### H-2 · User Object Persisted in localStorage
- **File:** `admin/src/state/authStore.ts` (line ~48–53)
- **Severity:** HIGH
- **Description:** The Zustand auth store persists the `user` object (containing `role`, `email`, `restaurantId`, possibly more) to localStorage under the key `auth-storage`. While the access token is intentionally excluded (good!), the user object itself is sensitive. If the site has any XSS vulnerability (or a compromised browser extension), the user's profile is exfiltrable. Additionally, the role stored client-side could be tampered with to bypass client-side permission checks.
- **Fix:** (1) Minimize what's persisted — consider storing only a boolean `wasAuthenticated` flag for UX purposes, then rehydrating user data from the server on reload. (2) Accept that client-side role checks are for UX only and always enforce authorization server-side (which the backend presumably does).

### H-3 · Customer Data in Unencrypted IndexedDB
- **File:** `customer/src/utils/offlineDb.ts`
- **Severity:** HIGH
- **Description:** The offline database stores menu cache data and queued order payloads (which may contain `customerName`, `customerPhone`, payment context) in plain IndexedDB. IndexedDB is accessible to any JavaScript running on the same origin, including XSS payloads and malicious browser extensions.
- **Fix:** (1) Avoid storing PII in order queue payloads — or encrypt sensitive fields before storing. (2) Set a TTL and purge old records aggressively (currently no cleanup mechanism). (3) Consider clearing queued orders after successful sync (already done) and clearing menu cache periodically.

### H-4 · Client-Side Permission Bypass Possible
- **File:** `admin/src/components/ProtectedRoute.tsx`, `admin/src/components/RoleRedirect.tsx`
- **Severity:** HIGH
- **Description:** Permission checks (`pageKey`, `allowedRoles`) run entirely on the client using data from the Zustand store and settings API. A user who modifies the persisted `user.role` in localStorage from `"STAFF"` to `"OWNER"` can access any admin page. While the backend should reject unauthorized API calls, the UI might still expose sensitive UI elements, analytics, CRM data previews, etc.
- **Fix:** (1) Validate permissions from the server response on every protected route load (the current `useQuery` for settings helps, but session revalidation should also check the role). (2) Accept this as a UX-layer concern and ensure every admin API endpoint has proper server-side authorization (critical counterpart).

### H-5 · `forceLogout()` Uses `localStorage.removeItem` + Hard Navigation
- **File:** `admin/src/services/apiClient.ts` (line 173–174)
- **Severity:** HIGH
- **Description:** On auth failure, `forceLogout()` clears `auth-storage` from localStorage and redirects to `/login` using `window.location.href`. This doesn't clear in-memory Zustand state, React Query cache, WebSocket connections, or sessionStorage. Stale sensitive data may remain in memory until the hard navigation actually occurs.
- **Fix:** Trigger a proper logout flow: call `useAuthStore.getState().logout()`, clear React Query cache (`queryClient.clear()`), then redirect. Alternatively, `window.location.href = '/login'` does cause a full page reload which clears in-memory state, but sessionStorage survives — consider clearing `sessionStorage` explicitly.

---

## MEDIUM Issues

### M-1 · No Rate Limiting / Debounce on PIN Verification
- **File:** `admin/src/components/LockScreen.tsx`
- **Severity:** MEDIUM
- **Description:** The lock screen auto-submits the 6-digit PIN on completion with no client-side rate limiting or exponential backoff. While the backend should enforce rate limits, a brute-force attempt (10^6 = 1M combinations) could be automated against the frontend by repeatedly setting digits.
- **Fix:** Add a client-side cooldown after failed attempts (e.g., 3-second delay after each failure, doubling after 3 failures). The backend should also enforce rate limiting on the PIN verification endpoint.

### M-2 · Customer localStorage Stores PII Without Consent Notice
- **File:** `customer/src/components/CustomerInfoSheet.tsx` (line 23), `customer/src/context/RestaurantContext.tsx` (lines 66–87)
- **Severity:** MEDIUM
- **Description:** Customer name, phone number, restaurant name, table number, and restaurant slug are persisted to localStorage across sessions. This data survives browser close and is accessible to any script on the origin. No user consent or notification is shown for this storage.
- **Fix:** (1) Use `sessionStorage` instead of `localStorage` for customer PII (name, phone). (2) Add a brief privacy notice if localStorage is used for persistence across visits.

### M-3 · Open Redirect via `location.state.from`
- **File:** `admin/src/pages/LoginPage.tsx` (line 17)
- **Severity:** MEDIUM
- **Description:** After login, the user is navigated to `location.state?.from?.pathname`. An attacker could craft a link that sets `state.from` to an arbitrary path. While this is limited to same-origin paths (React Router), combined with any open redirect route it could chain into a full redirect.
- **Fix:** Validate that the `from` path starts with `/` and doesn't contain protocol prefixes. This is currently safe within React Router's SPA routing but is worth hardening.

### M-4 · Queue Display Page Exposes Order Data Without Authentication
- **File:** `customer/src/pages/QueueDisplayPage.tsx`
- **Severity:** MEDIUM
- **Description:** The route `/queue/:restaurantId` fetches and displays live order status including order numbers, customer names, and timing data. It requires only a `restaurantId` (which may be guessable). No authentication is required.
- **Fix:** Consider masking customer names (show only first letter) in the queue display. Ensure the backend strips PII before sending queue data for the public endpoint.

### M-5 · Cart Store Persisted in localStorage (Customer)
- **File:** `customer/src/state/cartStore.ts`
- **Severity:** MEDIUM
- **Description:** The entire cart (including `restaurantId`, `tableId`, item selections, customizations, special instructions) is persisted to localStorage via Zustand persist. Special instructions may contain PII or sensitive info like allergy details.
- **Fix:** Consider using sessionStorage for the cart store, or at minimum clear the cart on session end / table switch (the store already clears on table switch — good).

### M-6 · Error Messages May Leak Backend Details
- **File:** `admin/src/services/apiClient.ts`, `customer/src/services/apiClient.ts`
- **Severity:** MEDIUM
- **Description:** Both API clients surface `errorData.error?.message` directly in thrown errors, which are then displayed to users via toast notifications. If the backend returns verbose error messages (e.g., SQL errors, stack traces), these would be shown to end users.
- **Fix:** The frontend should show generic user-friendly messages for 5xx errors and only use server messages for 4xx validation errors. Add a check: `if (response.status >= 500) throw new Error('Something went wrong. Please try again.')`.

### M-7 · Socket Connection Reconnects Without Token Refresh
- **File:** `admin/src/context/SocketContext.tsx`
- **Severity:** MEDIUM
- **Description:** The socket connects with `auth: { token: accessToken }` and reconnects automatically, but the access token used is the one captured in the `useEffect` closure. If the token expires and is refreshed (new token in Zustand store), the socket reconnects with the **stale** token. The `useEffect` depends on `accessToken`, so it will recreate the socket on token change — but during the brief window between token expiry and refresh, reconnection attempts will use the old token.
- **Fix:** Consider passing a token-getter function to socket auth, or updating the socket's `auth` object on token refresh without recreating the entire connection.

### M-8 · Customer Socket Has No Authentication
- **File:** `customer/src/context/SocketContext.tsx`
- **Severity:** MEDIUM
- **Description:** The customer socket connection sends no authentication token or session identifier. It connects anonymously and joins rooms by simply emitting `order:join` or `join:table` with an ID. Any client that knows an order ID or table ID can subscribe to its events.
- **Fix:** (1) Send the session token as socket auth. (2) Backend should validate that the socket client has a valid session for the table before allowing room joins. (3) At minimum, bind room join to the session token stored in `sessionStorage`.

---

## LOW Issues

### L-1 · `err: any` Type Assertions
- **Files:** `customer/src/pages/GroupDashboardPage.tsx` (multiple locations), `admin/src/pages/SettingsPage.tsx`
- **Severity:** LOW
- **Description:** Several catch blocks use `err: any` which bypasses TypeScript's type safety and could mask unexpected error shapes.
- **Fix:** Use `err: unknown` with `(err as Error).message` pattern, or the existing `error instanceof Error` guard used elsewhere.

### L-2 · `generateCartItemId()` Uses Weak Randomness
- **File:** `customer/src/state/cartStore.ts`
- **Severity:** LOW
- **Description:** Cart item IDs are generated with `Math.random()`. This is fine for UI keys but shouldn't be relied on for anything security-sensitive.
- **Fix:** No action needed — these IDs are for React key purposes only. Note for awareness.

### L-3 · No Input Length Limits on Several Forms
- **File:** `admin/src/pages/SettingsPage.tsx`, `admin/src/components/menu/MenuItemForm.tsx`
- **Severity:** LOW
- **Description:** Text inputs for restaurant name, menu item descriptions, allergens, and tags lack `maxLength` attributes. While the backend should validate, the frontend should prevent excessively long inputs.
- **Fix:** Add `maxLength` attributes to text inputs (e.g., restaurant name: 100, description: 500).

### L-4 · Console Logging in Production (Customer Socket)
- **File:** `customer/src/context/SocketContext.tsx`
- **Severity:** LOW
- **Description:** Socket events like connect, disconnect, and errors log to console gated by `import.meta.env.DEV`. This is properly gated — but note that `DEV` can be true in staging builds depending on build configuration.
- **Fix:** Consider using a proper logging utility that can be configured per environment.

### L-5 · Offline Order Sync Uses Restaurant Slug in API Path
- **File:** `customer/src/utils/offlineSync.ts`  
- **Severity:** LOW
- **Description:** `syncOfflineOrders()` posts to `/restaurants/${order.restaurantSlug}/orders` using the slug stored at queue time. If the restaurant slug changes between offline queue and sync, orders will fail. The 3-retry limit provides some protection but "failed" orders are silently discarded.
- **Fix:** Notify the user when offline orders fail permanently (currently silent). Consider storing restaurant ID alongside slug for more stable routing.

### L-6 · Missing `rel="noopener noreferrer"` on External Links
- **File:** Various admin pages
- **Severity:** LOW
- **Description:** No external links with `target="_blank"` were identified in the source, so this is a preventive note. If any are added, ensure `rel="noopener noreferrer"` is included.
- **Fix:** Preventive — add to any future external links.

---

## INFO / Positive Patterns

### I-1 · ✅ Access Token Not Persisted to Storage (Admin)
- **File:** `admin/src/state/authStore.ts` (partialize config)
- The auth store explicitly excludes `accessToken` from localStorage persistence. Tokens live only in memory and are re-issued via HttpOnly cookie refresh on reload. This is an **excellent** security pattern.

### I-2 · ✅ DOMPurify Used in Admin Sanitizer
- **File:** `admin/src/utils/sanitize.ts`
- The admin package uses DOMPurify with `ALLOWED_TAGS: []` — effectively stripping all HTML. This is the correct approach for user-generated content.

### I-3 · ✅ Session Token Rotation for QR Abuse Prevention
- **File:** `customer/src/services/orderService.ts`, `customer/src/context/RestaurantContext.tsx`
- The system uses rotating session tokens stored in `sessionStorage` and includes them in order creation requests. This prevents QR code replay/abuse after a table session ends.

### I-4 · ✅ Concurrent Token Refresh Coalescing
- **Files:** `admin/src/services/apiClient.ts`, `customer/src/services/apiClient.ts`
- Both API clients implement a singleton `refreshPromise` pattern that prevents thundering-herd refresh requests when multiple concurrent 401s occur. This is a **well-implemented** pattern.

### I-5 · ✅ Idempotency Keys for Order Creation
- **File:** `customer/src/services/orderService.ts`
- Order creation sends an `X-Idempotency-Key` header, preventing duplicate orders from double-taps or network retries.

### I-6 · ✅ Payment Signature Verification
- **File:** `customer/src/hooks/useRazorpay.ts`
- Razorpay payment verification happens server-side — the frontend sends `razorpay_signature` to the backend for validation rather than trusting the client callback. This is the correct payment integration pattern.

### I-7 · ✅ Geo-fence Coordinates Sent with Orders
- **File:** `customer/src/services/orderService.ts`, `customer/src/hooks/useGeolocation.ts`
- Location coordinates are sent with orders for server-side geo-fence validation. The frontend degrades gracefully if geolocation is unavailable — the server makes the authorization decision.

---

## Summary of Recommendations (Priority Order)

1. **[CRITICAL]** Add `X-Requested-With: XMLHttpRequest` CSRF header to admin API client
2. **[CRITICAL]** Never return Razorpay secret key from backend GET; redesign settings form for write-only secrets
3. **[HIGH]** Replace customer `sanitize()` no-op with DOMPurify
4. **[HIGH]** Minimize user data stored in localStorage; clear sessionStorage on force logout
5. **[HIGH]** Add client-side rate limiting on PIN verification attempts
6. **[MEDIUM]** Add session token to customer socket authentication
7. **[MEDIUM]** Use sessionStorage instead of localStorage for customer PII
8. **[MEDIUM]** Sanitize backend error messages before displaying (generic for 5xx)
9. **[MEDIUM]** Handle stale socket tokens on reconnection
10. **[LOW]** Add `maxLength` to input fields, fix `err: any` types
