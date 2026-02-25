# Admin Frontend – Comprehensive Code Audit

**Scope:** `packages/admin/src/` — all 52 source files  
**Date:** 2025-01-XX  

---

## Table of Contents

1. [Architecture & Structure](#1-architecture--structure)
2. [Component Quality](#2-component-quality)
3. [State Management](#3-state-management)
4. [Routing & Navigation](#4-routing--navigation)
5. [API Integration](#5-api-integration)
6. [Security](#6-security)
7. [UI/UX](#7-uiux)
8. [TypeScript Usage](#8-typescript-usage)
9. [Performance](#9-performance)
10. [Socket Integration](#10-socket-integration)

Severity key: **Critical** | **High** | **Medium** | **Low**

---

## 1. Architecture & Structure

### Strengths
- Clean monorepo separation (`admin/`, `backend/`, `customer/`).
- Service layer (`services/`) properly abstracts API calls away from components.
- Vite manual chunk splitting in `vite.config.ts` (vendor, state, charts, ui) reduces initial bundle.
- Lazy loading of all page routes via `React.lazy` in `App.tsx`.
- Well-defined `@` path alias configured in `vite.config.ts`.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| A1 | `pages/OrdersPage.tsx` | 1–1165 | **High** | **God component** — 1165 lines containing 8+ inline sub-components (`OrderSkeleton`, `EmptyState`, `OrderCard`, `OrderDetail`, `TableBillCard`, etc.). Extremely difficult to test, maintain, or reuse. | Extract inline sub-components into `components/orders/`. Each should be its own file. |
| A2 | `pages/SettingsPage.tsx` | 1–1074 | **High** | 1074-line page containing profile editing, OTP modal, password modal, restaurant settings, and order preferences all in one file. | Split into `ProfileTab.tsx`, `RestaurantTab.tsx`, `OrdersTab.tsx` and shared modals. |
| A3 | `pages/DashboardPage.tsx` | 1–942 | **High** | 942 lines with 8 inline sub-components (`StatCard`, `RevenueAreaChart`, `RevenueDonut`, `RecentOrdersTable`, `ActivityFeed`, `HourlyChart`, `DailySummaryPanel`, `StatCardsSkeleton`). | Extract to `components/dashboard/`. |
| A4 | `pages/MenuPage.tsx` | 1–894 | **High** | 894 lines containing full menu CRUD UI, search, pagination, and inline rendering logic. | Extract item grid, pagination, and filter bar into separate components. |
| A5 | `components/menu/MenuItemForm.tsx` | 1–804 | **Medium** | 804 lines — complex form with image upload, chip inputs, modifier groups, diet auto-detection. | Extract `ModifierGroupEditor`, `ChipInput`, `ImageUploader` as reusable components. |
| A6 | All imports | various | **Low** | `@` alias is configured in `vite.config.ts` but never used — all imports use relative paths (`../../services`). | Adopt `@/services`, `@/components`, etc. consistently, or remove the unused alias. |
| A7 | — | — | **Low** | No `constants.ts` file — magic strings for status values, payment methods, etc. are scattered across components. | Create `src/constants/` with `orderStatuses.ts`, `paymentMethods.ts`, etc. |

---

## 2. Component Quality

### Strengths
- `ErrorBoundary` correctly uses a class component (the only valid React pattern for error boundaries).
- `Modal` has proper focus trap implementation, Escape key handling, backdrop click, and `aria-*` attributes.
- `Toggle` includes full accessibility support (`role="switch"`, `aria-checked`, keyboard handling).
- `RunningTableCard` is properly `React.memo`-ized with its own `displayName`.
- `LoadingScreen` uses a clean animated spinner.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| C1 | `components/CashierOrderModal.tsx` L36–41, `pages/MenuPage.tsx` L14–20 (approx) | — | **Medium** | `DietBadge` component is **duplicated** in two files with identical logic. | Extract to `components/DietBadge.tsx` and import in both places. |
| C2 | `components/ViewOrderModal.tsx` | 28–43 | **Medium** | Builds a custom modal overlay (fixed backdrop + centered content) instead of reusing the `Modal` component. | Refactor to use `<Modal>` for consistent behavior (focus trap, escape, accessibility). |
| C3 | `components/CashierOrderModal.tsx` | 204–210 | **Medium** | Builds its own full-screen overlay instead of reusing `Modal`. | Consider wrapping content in a full-screen variant of `Modal`. |
| C4 | `components/PrintInvoice.tsx` | 67–72 | **Low** | `useEffect` contains commented-out auto-print code and an unused `setTimeout`. Dead code. | Remove the dead `useEffect` or implement auto-print properly. |
| C5 | `pages/TablesPage.tsx` | 411 | **Medium** | Uses native `confirm()` for delete — not styled, not accessible, breaks visual consistency. | Replace with a custom confirmation modal component. |
| C6 | `pages/MenuPage.tsx` | 544, 824 | **Medium** | Two more `confirm()` calls for deleting categories and items. Same issue. | Same fix — use a shared `ConfirmDialog` component. |
| C7 | `pages/DashboardPage.tsx` | various | **Medium** | All inline sub-components (`StatCard`, `RevenueAreaChart`, etc.) are plain functions defined inside the page component. Without `React.memo`, they re-render on every parent state change. | Either extract them outside the component or wrap with `React.memo`. |

---

## 3. State Management

### Strengths
- Zustand `authStore` with `persist` middleware correctly excludes `accessToken` via `partialize` — token stays in memory only, reducing XSS surface.
- React Query used consistently for all server state with sensible defaults (`staleTime: 2min`, `gcTime: 10min`, `retry: 2`).
- `PaymentRequestContext` stores pending requests in `sessionStorage` — survives page refreshes without leaking across tabs.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| S1 | `context/SocketContext.tsx` | ~50–80 | **Medium** | Socket connection `useEffect` has `accessToken` in its dependency array. Every token refresh (happens automatically via apiClient) destroys and recreates the socket connection. During concurrent requests triggering 401s, this could cause rapid reconnection storms. | Remove `accessToken` from the dep array; read the current token inside the `auth` callback using `authStore.getState().accessToken` instead. |
| S2 | `context/AuthContext.tsx` | ~40–60 | **Low** | The `useEffect` for fetching `/auth/me` uses `clearUser` from Zustand in its error handler but it's not in the dependency array. While `clearUser` is a stable Zustand selector (so it's technically safe), ESLint's `react-hooks/exhaustive-deps` rule will flag this. | Add `clearUser` to the dependency array for correctness, or suppress with a comment explaining stability. |
| S3 | `components/CashierOrderModal.tsx` | 145–155 | **Low** | Cart state `getCartQty` callback has `[cart]` as dependency, so it's recreated on every cart change. All menu item buttons that use it will re-render. | Since `getCartQty` is used during render (not as event handler), move the lookup inline or use a Map ref for O(1) lookups. |

---

## 4. Routing & Navigation

### Strengths
- All page routes are lazy-loaded with `React.lazy` + `Suspense` fallback.
- `ProtectedRoute` checks both auth state and user role for route guarding.
- Redirect from `/` to `/dashboard` provides good default behavior.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| R1 | `App.tsx` | 62 | **Medium** | Catch-all route `<Route path="*" element={<Navigate to="/dashboard" />} />` silently redirects invalid URLs. User gets no indication they hit a wrong URL. | Add a dedicated `NotFoundPage` that displays a 404 message with a link to dashboard. |
| R2 | `App.tsx` | — | **Low** | No scroll-to-top behavior on route changes. When navigating from a scrolled page, the new page may start scrolled down. | Add a `ScrollToTop` component using `useLocation` + `useEffect` with `window.scrollTo(0, 0)`. |
| R3 | `main.tsx` | 52 | **Low** | `BrowserRouter` has no `basename` prop. If the admin app is ever deployed to a subpath (e.g., `/admin/`), routing will break. | Consider making `basename` configurable via env var for deployment flexibility. |
| R4 | `App.tsx` | — | **Low** | Only one global `ErrorBoundary` wraps all routes. A crash in one page takes down navigation to all pages. | Add per-route error boundaries or a route-level wrapper that catches errors and shows recovery UI while keeping sidebar navigation accessible. |

---

## 5. API Integration

### Strengths
- Centralized `ApiClient` singleton with automatic 401 → token refresh → retry.
- Concurrent refresh calls are coalesced (only one refresh in-flight at a time).
- `credentials: 'include'` enables HttpOnly cookie support.
- `forceLogout()` clears state and redirects cleanly on unrecoverable auth errors.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| **I1** | `components/SettlementModal.tsx` | 85, 139 | **Critical** | Uses `localStorage.getItem('accessToken')` for auth headers in raw `fetch()` calls. **The access token is NOT stored in localStorage** — the Zustand `authStore` uses `partialize` to exclude it. Additionally, `credentials: 'include'` is not set, so cookies won't be sent either. **Settlement and payment operations will fail with a 401.** There are **zero** `localStorage.setItem` calls in the entire admin codebase. | Replace raw `fetch()` with `apiClient.get()` / `apiClient.post()`. This provides proper auth headers, automatic 401 retry, and credential handling. |
| **I2** | `components/PrintInvoice.tsx` | 54 | **Critical** | Same `localStorage.getItem('accessToken')` issue as I1. Print invoice fetching will fail. No `credentials: 'include'` either. | Replace with `apiClient.get(`/sessions/${sessionId}/print`)`. |
| I3 | `services/menuService.ts` | ~70–82 | **High** | `uploadImage` uses raw `fetch()` bypassing `apiClient`. This means: (a) no automatic 401 → refresh → retry, (b) must manually set auth headers. If the token expires during upload, the request fails silently. | Route through `apiClient` — add a `postFormData` method to `ApiClient` that skips the `Content-Type: application/json` header. |
| I4 | `utils/formatCurrency.ts` | 11 | **Medium** | Hardcodes `'en-IN'` locale for `Intl.NumberFormat` regardless of currency. A USD amount formats as `$1,00,000.00` (Indian grouping) instead of `$100,000.00`. | Accept a `locale` parameter, or derive it from the currency code (e.g., `USD` → `'en-US'`). |
| I5 | `pages/AnalyticsPage.tsx` | 462 | **Medium** | YAxis `tickFormatter` hardcodes `$` symbol: `` `$${v >= 1000 ? ...}` ``. Should use the restaurant's configured currency. | Use `formatCurrency(v)` or at minimum the dynamic currency symbol from settings. |
| I6 | `components/menu/MenuItemForm.tsx` | ~753 | **Low** | Modifier price label reads `+$` (hardcoded dollar sign) next to the price input. | Use the restaurant's currency symbol dynamically via `getCurrencySymbol()`. |

---

## 6. Security

### Strengths
- `accessToken` stored only in Zustand memory — not in `localStorage`, mitigating XSS token theft.
- DOMPurify via `sanitize.ts` for user-provided HTML content.
- Password confirmation required before disabling order acceptance.
- OTP-based email verification for profile changes.
- HttpOnly refresh token via `credentials: 'include'`.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| **X1** | `components/SettlementModal.tsx` | 85, 139 | **Critical** | Authentication completely bypassed due to I1 (see API Integration). Raw `fetch` with null Bearer token = unauthenticated requests to payment endpoints. | Fix per I1. |
| **X2** | `components/PrintInvoice.tsx` | 54 | **Critical** | Same authentication bypass as X1 for invoice data. | Fix per I2. |
| X3 | `services/menuService.ts` | ~72 | **High** | `uploadImage` constructs its own bearer token from `authStore.getState().accessToken`. While this works (unlike I1/I2), it bypasses the apiClient's centralized refresh logic. If the token has expired, the upload will fail without retry. | Route through `apiClient` for consistent auth handling. |
| X4 | `context/SocketContext.tsx` | ~60 | **Medium** | Socket auth passes `accessToken` in the connection `auth` object. If the token is intercepted on the socket transport before TLS, it's exposed. | Ensure socket connections use WSS (TLS) in production. Add explicit WSS enforcement check. |
| X5 | `vite-env.d.ts` | 1–11 | **Low** | `VITE_CUSTOMER_URL` is used in `QRCodeModal.tsx` but is not declared in the `ImportMetaEnv` interface. TypeScript will not catch typos in this env var name. | Add `readonly VITE_CUSTOMER_URL: string;` to the interface. |

---

## 7. UI/UX

### Strengths
- Comprehensive custom design system in `tailwind.config.js` with semantic color tokens (`primary`, `surface`, `text-primary`, etc.).
- Consistent component-level CSS classes in `index.css` (`btn-primary`, `card`, `input`, `badge-*`).
- Framer Motion for smooth page transitions, modal animations, and micro-interactions.
- Good loading skeletons for dashboard, running tables, and order lists.
- `PrintInvoice.css` optimized for 80mm thermal printers with proper `@media print` rules.
- Quicksand font properly loaded with `preconnect` + `preload` in `index.html`.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| U1 | `pages/TablesPage.tsx`, `pages/MenuPage.tsx` | 411, 544, 824 | **Medium** | Native `window.confirm()` pop-ups break visual consistency and are not styled or accessible. | Create a shared `ConfirmDialog` component using the existing `Modal`. |
| U2 | `utils/getStatusColor.ts` | 4 | **Low** | JSDoc says "DaisyUI badge class" but the project has no DaisyUI. The returned classes (`badge-warning`, `badge-info`, etc.) **do** map to custom classes defined in `index.css`, so this works — but the comment is misleading. | Update the JSDoc to say "custom badge class" and remove DaisyUI reference. |
| U3 | `components/PrintInvoice.tsx` | ~165 | **Low** | Date formatted with hardcoded `'en-IN'` locale. Users in other regions will see Indian date format. | Use the browser's default locale or make this configurable. |
| U4 | — | — | **Low** | No dark mode support. All color values are hardcoded to light theme. | Consider adding dark mode via Tailwind's `dark:` variant. Lower priority. |

---

## 8. TypeScript Usage

### Strengths
- Comprehensive type definitions in `types/index.ts` covering all domain models.
- Proper use of generic setter pattern in form components: `set<K extends keyof FormData>(key: K, value: FormData[K])`.
- Well-typed React Query hooks with explicit generics.
- Interface-first approach for all component props.
- `vite-env.d.ts` augments `ImportMetaEnv` for type-safe env var access.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| T1 | `services/tableService.ts` | 26–39 | **High** | `normalizeTable` takes `Record<string, unknown>` then casts to `Table` via `as unknown as Table`. All subsequent property access is type-unsafe. The compiler cannot verify any of the property accesses. | Define a `RawTableResponse` interface matching the actual API shape and use a proper mapper. |
| T2 | `services/orderService.ts` | ~30–70 | **High** | `mapApiOrder` takes `Record<string, unknown>` and performs extensive unsafe casting. Same as T1 — compiler is blind to the actual data shape. | Define `RawOrderResponse` type from API schema. Use `zod` or `io-ts` for runtime validation. |
| T3 | `components/SettlementModal.tsx` | 106–120 | **Medium** | Query function uses `any` casts: `order.items.map((item: any) => ...)`. Disables all type checking for the data transformation. | Type the API response with a proper interface and remove `any`. |
| T4 | `vite-env.d.ts` | 1–11 | **Medium** | Missing `VITE_CUSTOMER_URL` from env type declaration. Used in `QRCodeModal.tsx` without type safety. | Add `readonly VITE_CUSTOMER_URL: string;` |
| T5 | `components/menu/MenuItemForm.tsx` | 177–180 | **Low** | `useEffect` deps `[form.ingredients, form.customizationGroups]` are incomplete — `containsNonVegIngredients()` also checks `form.name` and `form.description`. Changes to name/description won't trigger auto-detection. | Add `form.name` and `form.description` to the dependency array. |
| T6 | `services/tableService.ts` | 28–30 | **Low** | `normalizeTable` mutates its input object directly (`t.status = ...`). Since `t` is an alias for `raw`, callers may not expect side effects. | Create a shallow copy: `const t = { ...(raw as unknown as Table) }`. |

---

## 9. Performance

### Strengths
- Lazy loading all page routes reduces initial bundle.
- Vite manual chunks (`vendor`, `state`, `charts`, `ui`) enable parallel loading.
- `useMemo` applied to filtered/computed data in most list views (e.g., `availableItems`, `dropdownTables`, `activeCategories`).
- `useCallback` used for event handlers in `CashierOrderModal`.
- `RunningTableCard` properly memoized with `React.memo`.
- React Query's `staleTime` prevents unnecessary refetches.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| P1 | `components/RunningTablesSection.tsx` | 21–23 | **Medium** | Each `RunningTableCard` creates its own `setInterval` (1-second timer). With 20 running tables, that's 20 intervals ticking every second. | Lift the timer to the parent `RunningTablesSection` and pass `currentTime` as a prop, or use a shared context/ref. |
| P2 | `pages/DashboardPage.tsx` | various | **Medium** | Inline sub-components (`StatCard`, `RevenueAreaChart`, `RevenueDonut`, etc.) are defined inside the page component. They are not `React.memo`-ized and close over parent state, meaning they re-render on every state change in the parent. | Extract them out of the component scope and apply `React.memo` where appropriate. |
| P3 | `pages/OrdersPage.tsx` | various | **Medium** | Similarly, `OrderCard`, `EmptyState`, `OrderSkeleton`, and `TableBillCard` are defined inline without memoization. The orders page with many orders will trigger lots of unnecessary re-renders. | Extract and memoize. |
| P4 | `pages/OrdersPage.tsx` | — | **Low** | No list virtualization. All orders render in the DOM regardless of visibility. For restaurants with hundreds of orders, this causes DOM bloat. | Consider `react-window` or `react-virtuoso` for the order list. |
| P5 | `pages/CashierOrderModal.tsx` | ~147 | **Low** | `getCartQty` has `[cart]` as dependency — it's recreated on every cart change. Every menu item button receives a new function reference. | Move the cart quantity lookup inline or use a `Map` ref for O(1) lookups without callback dependency. |

---

## 10. Socket Integration

### Strengths
- Robust callback-ref pattern (`useRef` + subscription functions) prevents stale closures in socket event handlers.
- Socket auto-reconnects on document visibility change (tab re-focus).
- `reconnectionAttempts: Infinity` ensures persistent connectivity.
- Context value is properly memoized with `useMemo` to prevent unnecessary re-renders.
- Clean unsubscribe-on-unmount via returned cleanup functions.

### Issues

| # | File | Line(s) | Severity | Description | Recommended Fix |
|---|------|---------|----------|-------------|-----------------|
| K1 | `context/SocketContext.tsx` | ~50–80 | **High** | The main socket `useEffect` includes `accessToken` in its dependency array. When the `apiClient` auto-refreshes the token (on 401), the Zustand store updates `accessToken`, which triggers a full socket disconnect → reconnect. During burst 401s, this can cause rapid reconnection storms. | Read the token inside the socket's `auth` callback via `authStore.getState().accessToken` instead of closing over the reactive value. Remove `accessToken` from the useEffect deps. |
| K2 | `context/SocketContext.tsx` | various | **Medium** | Socket event handlers (e.g., `onOrderUpdate`) call `queryClient.invalidateQueries()` immediately. If the server emits many rapid events (e.g., batch status changes), each event triggers a separate query invalidation and refetch. | Debounce invalidation calls (e.g., `requestAnimationFrame` or `setTimeout` coalescing) to batch rapid-fire updates into a single refetch. |
| K3 | `context/SocketContext.tsx` | — | **Low** | No application-level heartbeat or connection-quality monitoring beyond socket.io's built-in ping/pong. If the server is reachable but the app-level protocol is broken, there's no detection. | Optional: Add a periodic app-level ping that validates the session is still active. |

---

## Summary

### Critical Issues (2 unique, 4 occurrences)

| ID | Description |
|----|-------------|
| I1/X1 | `SettlementModal` uses `localStorage.getItem('accessToken')` which returns `null` — settlement and split-payment operations are broken. |
| I2/X2 | `PrintInvoice` uses the same broken `localStorage.getItem('accessToken')` pattern — invoice fetching fails. |

**Root cause:** Both components use raw `fetch()` instead of the centralized `apiClient`, and incorrectly assume the access token is in `localStorage` when it's actually only in Zustand in-memory state.

**Fix:** Replace all 3 occurrences of `localStorage.getItem('accessToken')` with calls through `apiClient`.

### High Issues (5)

| ID | Summary |
|----|---------|
| A1–A4 | Four page components exceed 800 lines with inline sub-components — severe maintainability debt. |
| I3/X3 | `menuService.uploadImage` bypasses `apiClient` — no automatic auth refresh for uploads. |
| T1–T2 | `normalizeTable` and `mapApiOrder` use `Record<string, unknown>` with unsafe casts, defeating TypeScript's safety. |
| K1 | Socket reconnects on every token refresh due to `accessToken` in useEffect deps. |

### Counts by Severity

| Severity | Count |
|----------|-------|
| Critical | 4 (2 unique bugs) |
| High | 8 |
| Medium | 16 |
| Low | 14 |
| **Total** | **42** |
