# PROJECT AUDIT — QR Order Web

> **Audit Date:** February 16, 2026  
> **Auditor:** Senior Software Architect / Senior React Engineer  
> **Scope:** Full repository — `packages/backend`, `packages/admin`, `packages/customer`, root config, Docker/Nginx

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Folder & Architecture Breakdown](#3-folder--architecture-breakdown)
4. [State Flow Analysis](#4-state-flow-analysis)
5. [Security Audit](#5-security-audit)
6. [Performance Audit](#6-performance-audit)
7. [UI/UX Implementation Status](#7-uiux-implementation-status)
8. [API Layer Review](#8-api-layer-review)
9. [Bug & Risk Detection](#9-bug--risk-detection)
10. [Technical Debt Report](#10-technical-debt-report)
11. [Immediate Action Recommendations](#11-immediate-action-recommendations)

---

## 1. Project Overview

### 1.1 Project Purpose

A **multi-tenant SaaS platform for QR-based restaurant ordering**. Restaurants generate QR codes placed on tables. Customers scan the QR code to browse the menu, customize items, place orders, and track status in real-time. An admin panel allows restaurant owners/staff to manage menus, tables, orders, and view analytics.

### 1.2 Application Architecture

The project is an **npm workspaces monorepo** with three packages:

| Package | Purpose | Port |
|---|---|---|
| `@qr-order/customer` | Customer-facing PWA (browse menu, order, track) | 5173 |
| `@qr-order/admin` | Admin dashboard (manage menu, orders, tables, analytics) | 5174 / 3002 (dev) |
| `@qr-order/backend` | REST API + WebSocket server | 3000 |

Infrastructure: PostgreSQL 16 + Redis 7 via Docker Compose, Nginx reverse proxy for frontend serving.

### 1.3 Current Completion Status Estimate

| Component | Completion | Notes |
|---|---|---|
| **Backend API** | ~70% | Core CRUD works. Payment, user management, file uploads, password reset, scheduled tasks all missing. |
| **Admin Panel** | ~40% | Pages exist but most are read-only or mock-only. Menu create/edit forms, settings persistence, table CRUD, pagination, search all missing. |
| **Customer App** | ~65% | Menu browsing, item customization, cart, order placement, real-time tracking work. Cart persistence, order cancellation, QR scanning, restaurant closed handling missing. |
| **Infrastructure** | ~80% | Docker Compose, Dockerfiles, Nginx well-configured. Missing CI/CD, .env.example, monitoring, logging. |
| **Overall** | **~55%** | Core happy path functional. Most edge cases, error handling, admin workflows, and production hardening missing. |

### 1.4 Identified Missing Core Flows

| # | Missing Flow | Impact |
|---|---|---|
| 1 | **Payment processing** | `PaymentStatus` in schema is never mutated — dead feature |
| 2 | **Menu item create/edit forms (Admin)** | Buttons exist with no UI — menu can only be managed via seed script |
| 3 | **Settings persistence (Admin)** | `handleSave` is a fake `setTimeout` — settings never reach the API |
| 4 | **QR code scanning** | Landing page has hardcoded demo link — no dynamic QR flow |
| 5 | **Cart persistence** | Cart lost on page refresh — no `localStorage`/`zustand/persist` |
| 6 | **Order cancellation** | `orderService.cancel` exists but no UI button anywhere |
| 7 | **Password reset flow** | No forgot password endpoint or UI |
| 8 | **User management CRUD** | Validators defined, no routes or controllers |
| 9 | **File/image uploads** | `logo`, `coverImage`, `image` fields exist with no upload mechanism |
| 10 | **Restaurant closed handling** | `isOpen` flag exists but ordering is not blocked when false |
| 11 | **Minimum order enforcement** | `minimumOrderAmount` setting exists but never checked in cart/order flow |
| 12 | **Token refresh** | `authService.refreshToken()` exists on both admin and customer but is never called |

---

## 2. Tech Stack

### 2.1 Frontend (Customer + Admin)

| Aspect | Technology | Version | Notes |
|---|---|---|---|
| **Framework** | React | ^18.2.0 | Functional components, hooks-only |
| **Language** | TypeScript | ^5.3.3 | Strict mode enabled |
| **Build Tool** | Vite | ^5.0.12 | With manual chunk splitting |
| **State (Client)** | Zustand | ^4.5.0 | With `immer` middleware (customer cart), `persist` middleware (admin auth) |
| **State (Server)** | TanStack React Query | ^5.17.9 | Configured with staleTime, gcTime, retry |
| **Routing** | React Router | ^6.21.3 | Lazy-loaded routes with `React.lazy` + `Suspense` |
| **Styling** | Tailwind CSS | ^3.4.1 | Custom design tokens, component classes in CSS |
| **Animation** | Framer Motion | ^10.18.0 | Drag gestures (cart), sheet animations, layout animations |
| **Notifications** | react-hot-toast | ^2.4.1 | Toast-based UX feedback |
| **Charts (Admin)** | Recharts | ^2.10.4 | Line charts, bar charts |
| **WebSocket** | socket.io-client | ^4.7.4 | Real-time order/table updates |
| **PWA (Customer)** | vite-plugin-pwa | ^0.17.5 | Service worker, installable, offline caching strategies |
| **Form Handling** | **None** | — | No form library (react-hook-form, Formik). Plain `useState` for all forms. |
| **Validation (Frontend)** | **None** | — | No client-side validation library. Minimal inline checks only. |
| **API Communication** | Custom `fetch` wrapper | — | Class-based `apiClient`, `credentials: 'include'` for cookies |
| **XSS Protection** | `dompurify` installed | ^3.0.8 | **NEVER imported or used** — dead dependency in both packages |

### 2.2 Backend

| Aspect | Technology | Version | Notes |
|---|---|---|---|
| **Runtime** | Node.js | 20 (Docker) | TypeScript compiled via `tsc` |
| **Framework** | Express | ^4.18.2 | Standard REST API |
| **ORM** | Prisma | ^5.8.1 | PostgreSQL provider |
| **Database** | PostgreSQL | 16 (Docker) | 11 models, 4 enums |
| **Cache** | Redis (ioredis) | ^5.3.2 | TTL-based caching, Socket.io adapter |
| **Auth** | JWT (jsonwebtoken) | ^9.0.2 | Access + Refresh tokens, HttpOnly cookies |
| **Password Hashing** | bcryptjs | ^2.4.3 | 12 salt rounds |
| **Validation** | Zod | ^3.22.4 | Request body/params/query validation |
| **WebSocket** | Socket.io | ^4.7.4 | Redis adapter for horizontal scaling |
| **Security** | Helmet | ^7.1.0 | Security headers |
| **Rate Limiting** | express-rate-limit | ^7.1.5 | In-memory store (not Redis-backed) |
| **Compression** | compression | ^1.7.4 | Gzip/deflate |

### 2.3 Infrastructure

| Aspect | Technology | Notes |
|---|---|---|
| **Containerization** | Docker + Docker Compose | Multi-stage builds, non-root user, health checks |
| **Web Server** | Nginx Alpine | SPA fallback, gzip, security headers, 1-year static cache |
| **Database** | PostgreSQL 16 Alpine | Named volume for persistence |
| **Cache** | Redis 7 Alpine | Append-only persistence |
| **Process Manager** | dumb-init | Proper signal forwarding in Docker |

### 2.4 Environment Variables

| Variable | Package | Required | Default | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | backend | **Yes** | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | backend | **Yes** | — | Min 32 chars |
| `JWT_REFRESH_SECRET` | backend | **Yes** | — | Min 32 chars |
| `REDIS_URL` | backend | No | `redis://localhost:6379` | |
| `PORT` | backend | No | `3000` | |
| `CORS_ORIGIN` | backend | No | `http://localhost:5173` | Comma-separated |
| `VITE_API_URL` | admin, customer | **Yes** | — | **No `.env.example` file exists** |
| `VITE_SOCKET_URL` | admin, customer | **Yes** | — | Fallback: `http://localhost:3001` |

**Critical Issue:** No `.env.example` or `.env.template` file exists anywhere in the repository. Developers must read source code to discover required environment variables.

---

## 3. Folder & Architecture Breakdown

### 3.1 High-Level Structure

```
qr_order_web/
├── docker-compose.yml          # Production compose (Postgres, Redis, Backend, Customer, Admin)
├── docker-compose.dev.yml      # Dev compose (Postgres + Redis only)
├── Dockerfile.backend          # Multi-stage Node.js build
├── Dockerfile.frontend         # Multi-stage Vite build → Nginx
├── nginx.conf                  # SPA-aware Nginx with security headers
├── package.json                # Workspace root
└── packages/
    ├── admin/                  # Admin SPA (React + Vite)
    ├── backend/                # API server (Express + Prisma)
    └── customer/               # Customer PWA (React + Vite)
```

### 3.2 Backend Architecture Pattern: **Layered (Controller → Service → Prisma)**

```
Routes (validation + auth middleware)
  → Controllers (HTTP layer: parse request, call service, send response)
    → Services (business logic + caching)
      → Prisma ORM (database queries)
      → Redis (caching)
```

**Issues:**
- Socket.io event emission leaks into controllers instead of using an event-driven pattern
- Services use object literal pattern with `this` references — fragile if methods are destructured
- No dependency injection — services import singletons directly

### 3.3 Frontend Architecture Pattern: **Page-Based (Flat)**

Both admin and customer use a flat page-based structure:
```
src/
├── components/     # Reusable UI components (many are dead code)
├── context/        # React Context providers
├── pages/          # Top-level route components
├── services/       # API service modules with mock fallback
├── state/          # Zustand stores
└── types/          # TypeScript type definitions
```

**Issues:**
- Not atomic, not feature-based — all components in one flat folder regardless of scope
- Pages are extremely large (400–600+ lines) with inline sub-components instead of decomposed modules
- No shared utilities folder — `formatPrice`, `getStatusColor`, category icons are duplicated across files

### 3.4 Reusable Component Detection

**Admin Package:**
| Component | Reusable? | Actually Used? |
|---|---|---|
| `LoadingScreen` | Yes | Yes (Suspense fallback) |
| `Logo` | Yes | Yes (LoadingScreen, LoginPage) |
| `ProtectedRoute` | Yes | Yes (route guard) |

**Customer Package:**
| Component | Reusable? | Actually Used? |
|---|---|---|
| `AnimatedPage` | Yes | Yes (page wrapper, but non-functional animation) |
| `CartItemCard` | Yes | **No — dead code** |
| `CategoryScroller` | Yes | **No — dead code** |
| `FloatingCartButton` | Yes | Yes (MenuPage, CategoryPage) |
| `HeaderBar` | Yes | **No — dead code** |
| `ItemDetailDrawer` | Yes | Yes (MenuPage, CategoryPage) |
| `LoadingScreen` | Yes | Yes (Suspense fallback) |
| `Logo` | Yes | Yes (LoadingScreen, LandingPage) |
| `MenuItemCard` | Yes | **No — dead code** |
| `OrderStatusStepper` | Yes | Yes (OrderStatusPage) |
| `OrderSummaryPanel` | Yes | **No — dead code** |
| `QuantityStepper` | Yes | **No — transitively dead** (only used by dead CartItemCard) |
| `SkeletonLoader` | Partial | `MenuSkeleton` used; base `SkeletonLoader` and `CartSkeleton` dead |

### 3.5 Dead Code Detection

**Customer Package — Dead Components (5 of 14):**
- `CartItemCard.tsx` — replaced by inline `SwipeableCartItem` in CartPage
- `CategoryScroller.tsx` — replaced by grid/sidebar layout
- `HeaderBar.tsx` — all pages implement inline headers
- `MenuItemCard.tsx` — pages render cards inline
- `OrderSummaryPanel.tsx` — bill details rendered inline

**Customer Package — Dead Services:**
- `restaurantService.getMenuItemsByCategory()` — never called
- `restaurantService.getMenuItem()` — never called
- `orderService.getByTable()` — never called
- `orderService.cancel()` — never called

**Backend — Dead Middleware/Code:**
- `verifyRestaurantAccess` middleware — defined, never imported
- `optionalAuth` middleware — defined, never imported
- `validateMultiple` — defined, never imported
- `socketEmitters` helpers — defined, never used
- `cleanupExpiredTokens` — defined, never scheduled
- `PaginationParams` type — defined, never used
- `createUserSchema`, `updateUserSchema`, `updateModifierGroupSchema`, `refreshTokenSchema`, `paginationSchema` — validators defined, never applied

### 3.6 Duplicate Logic Detection

| Duplicated Code | Location 1 | Location 2 | Lines Wasted |
|---|---|---|---|
| `categoryIcons` object (~35 entries) | `MenuPage.tsx` | `CategoryPage.tsx` | ~40 |
| `categoryImages` object (~35 entries) | `MenuPage.tsx` | `CategoryPage.tsx` | ~90 |
| `getCategoryIcon()` function | `MenuPage.tsx` | `CategoryPage.tsx` | ~8 |
| `getCategoryImage()` function | `MenuPage.tsx` | `CategoryPage.tsx` | ~8 |
| `formatPrice` / `fmtPrice` utility | Every page file (6+) | — | ~30 |
| `getStatusColor` utility | `DashboardPage.tsx` | `OrdersPage.tsx` | ~20 |
| `formatCurrency` utility | `DashboardPage.tsx` | `AnalyticsPage.tsx` | ~10 |
| `USE_MOCK` constant | `authService.ts` (local) | `mockData.ts` (exported) | Divergence risk |

**Total estimated duplicated lines: ~200+**

### 3.7 Anti-Pattern Detection

| # | Anti-Pattern | Location | Impact |
|---|---|---|---|
| 1 | **Inline sub-components in page files** | All pages in both packages | Components recreated every render, not reusable, 400-600 line files |
| 2 | **Provider remounting on route change** | `customer/App.tsx` routes | Socket reconnections, data re-fetching on every navigation within restaurant scope |
| 3 | **Side effects inside state setter** | `ItemDetailPage.tsx` `handleOptionToggle` | Cart update inside `setSelectedOptions` callback |
| 4 | **Dynamic Tailwind class names** | `ItemDetailPage.tsx` ``rounded-${...}`` | Classes not detected at build time — will be missing from CSS |
| 5 | **Non-null assertions on request properties** | All backend controllers `req.restaurantId!` | Runtime crash if middleware chain is misconfigured |
| 6 | **Hardcoded mock flag** | `USE_MOCK = true` in service files | Requires code change to switch to real API |
| 7 | **Mixed state management (Admin)** | AuthContext + Zustand + localStorage | Three sources of truth for auth state |
| 8 | **KEYS command in Redis** | `redis.ts` `delPattern` | O(N) blocking operation in production |
| 9 | **Module-level mutable state** | Admin mock stores (`let mockItems = [...]`) | Shared mutable state across components, reset on module reload |
| 10 | **Socket event emission in controllers** | `orderController.ts` | Business logic leaking into HTTP layer |

---

## 4. State Flow Analysis

### 4.1 Global State Structure

**Customer Package:**
| Store | Library | Persisted | Purpose |
|---|---|---|---|
| `cartStore` | Zustand + Immer | **No** | Cart items, restaurant context, idempotency key |
| `RestaurantContext` | React Context + React Query | Via React Query cache | Restaurant + table data from URL params |
| `SocketContext` | React Context | No | WebSocket connection for order tracking |

**Admin Package:**
| Store | Library | Persisted | Purpose |
|---|---|---|---|
| `authStore` | Zustand + Persist | Partial (id, restaurantId only) | Auth user, login state |
| `AuthContext` | React Context (wraps authStore) | Via authStore | Login/logout methods |
| `SocketContext` | React Context | No | WebSocket for real-time order/table updates |

### 4.2 Data Flow Mapping

**Customer Order Flow:**
```
MenuPage → [+] click
  → if item has customizations → ItemDetailDrawer (bottom sheet)
  → if no customizations → addItem(item, qty=1, customizations=[], instructions=undefined)
  → cartStore.addItem() → merge or push CartItem

CartPage → Place Order
  → orderService.create(restaurantId, tableId, items, specialInstructions, idempotencyKey)
  → POST /api/public/r/:slug/orders (rate-limited: 5/min)
  → cartStore.clearCart()
  → navigate(/order-status/:orderId)

OrderStatusPage
  → useQuery (HTTP polling every 30s)
  → socket.joinOrderRoom(orderId)
  → onOrderStatusUpdate → refetch()
```

**Admin Order Flow:**
```
DashboardPage / OrdersPage
  → useQuery(['orders']) → GET /api/orders
  → socket.onNewOrder → invalidateQueries + audio notification
  → "Next Status" click → PATCH /api/orders/:id/status
  → socket.onOrderStatusUpdate → refetch()
```

### 4.3 API Request Lifecycle

```
Component → useQuery/useMutation (React Query)
  → service.method() → apiClient.request()
    → [Mock path]: return hardcoded/in-memory data
    → [Real path]: fetch(url, { credentials: 'include' })
      → 401 → hard redirect to /login
      → 4xx/5xx → throw Error with message
      → 200 → return parsed JSON .data
  → React Query caches/retries
  → Component re-renders with data/error/loading
```

### 4.4 Error Handling Strategy

| Layer | Strategy | Gaps |
|---|---|---|
| **Backend Controllers** | try/catch → `next(error)` | Consistent — no gaps |
| **Backend Error Handler** | Maps Zod/Prisma/AppError to HTTP codes | **Production errors not logged** — silent failures |
| **Backend Services** | Throws `AppError.notFound()` etc. | Some use raw `throw new Error()` inconsistently |
| **Admin Frontend** | `toast.error('Failed to...')` on mutation error | Generic messages, no user-actionable info |
| **Customer Frontend** | `toast.error()` for order failures | Cart page has error toast; other pages show inline error UI |
| **React Render Errors** | **No ErrorBoundary** in either frontend | Unhandled render error crashes entire app with white screen |

### 4.5 Loading States Implementation

| Page | Loading Pattern | Quality |
|---|---|---|
| Customer MenuPage | `MenuSkeleton` (shimmer grid) | Good |
| Customer CategoryPage | `MenuSkeleton` | Good |
| Customer CartPage | Inline shimmer blocks | Good |
| Customer OrderStatusPage | Custom shimmer skeleton | Good |
| Customer ItemDetailPage | Full-screen skeleton | Good |
| Admin DashboardPage | No skeleton — empty until loaded | **Poor** |
| Admin OrdersPage | `isLoading ? skeleton : table` | Adequate |
| Admin MenuPage | Custom skeleton grid | Good |
| Admin TablesPage | `isLoading ? 'Loading...' : content` | **Poor** — text-only loading |
| Admin AnalyticsPage | No loading state visible | **Poor** |
| Admin SettingsPage | No loading (hardcoded state) | N/A — page is fake |

### 4.6 Missing State Safeguards

1. **Cart has no size limit** — users can add unlimited items with no warning
2. **Cart not persisted** (customer) — refresh loses all items
3. **Admin auth persistence is broken** — `isAuthenticated` not persisted, page refresh logs out
4. **No optimistic updates** on any mutation in either package
5. **No stale data indicators** — user never knows if displayed data is outdated
6. **No conflict resolution** — two admins changing the same order status simultaneously will race

---

## 5. Security Audit

### 5.1 Input Sanitization

| Input | Sanitized? | Location | Risk |
|---|---|---|---|
| Login email/password | Zod-validated (format + length) | Backend `loginSchema` | Low |
| Menu item names | Zod-validated (string, max length) | Backend `createMenuItemSchema` | Low |
| Special instructions (customer textarea) | **Not sanitized** | CartPage, ItemDetailPage | **Medium** — rendered in admin dashboard, potential stored XSS |
| Restaurant settings JSON | **No validation** | `PATCH /api/restaurant/settings` | **High** — arbitrary JSON injection |
| Table status | **No validation** on `PATCH /:id/status` | Backend `tables` route | Medium — invalid enum bypasses Zod |
| QR code param | **No validation** | `GET /tables/qr/:qrCode` | Low — Prisma escapes input |

### 5.2 XSS Protections

- `dompurify` is installed in **both** packages but **never imported or used** anywhere
- `helmet()` sets `X-XSS-Protection: 1; mode=block` header (backend) — deprecated but harmless
- Nginx adds `X-XSS-Protection: 1; mode=block`
- **No CSP (Content-Security-Policy)** header configured
- React's JSX auto-escapes string interpolation — protects against reflected XSS
- **Stored XSS risk:** Special instructions, customer names, and order notes are stored and rendered in admin without sanitization

### 5.3 CSRF Protections

- **No CSRF tokens** anywhere
- Relies on: `SameSite: Lax` cookies + CORS origin validation
- `credentials: 'include'` on all API calls means cookies are sent cross-origin if CORS allows the origin
- **Risk Level:** Low-Medium — SameSite + CORS is sufficient for most scenarios, but `Lax` allows GET requests from cross-origin navigations

### 5.4 Token Storage

| Token | Storage | Security |
|---|---|---|
| Access Token (JWT) | **In-memory** (returned in response body) | Good — not persisted |
| Refresh Token | **HttpOnly cookie** (`SameSite: Lax`, `Secure: production only`) | Good |
| Refresh Token (DB) | **Plaintext** in PostgreSQL `RefreshToken` table | **Bad** — should be hashed |
| Admin auth state | `localStorage` via Zustand persist | Medium — XSS can extract partial user data |
| Mock auth flag | `localStorage` key `mock_auth` | Low — debug only |

### 5.5 Exposure of Sensitive Keys

| Finding | Location | Severity |
|---|---|---|
| Demo credentials on login page | `admin/pages/LoginPage.tsx` — displays `admin@demo.com / password123` | **Medium** — visible in production builds |
| Seed credentials | `backend/scripts/seed.ts` — `Admin123!` | Low — seed script only |
| Docker Compose JWT secrets | `docker-compose.yml` — default fallback values | **High** — production deployments may use defaults |
| QR codes predictable | `tableService.ts` — `{restaurantId}-{tableNumber}-{uuid8}` | Medium — not cryptographically signed |

### 5.6 Validation Gaps

| Endpoint | Missing Validation | Risk |
|---|---|---|
| `PATCH /api/restaurant/settings` | No Zod schema | Arbitrary JSON injection |
| `PATCH /api/tables/:id/status` | No body validation | Invalid TableStatus values |
| `POST /api/auth/refresh` | No body/cookie validation | Token format not checked |
| `GET /api/orders/stats` | `dateFrom`/`dateTo` not validated | Invalid Date objects |
| `GET /api/orders/analytics` | `days` not validated | Non-numeric strings accepted |
| `GET /api/public/tables/qr/:qrCode` | No param validation | Arbitrary string passed to DB query |

---

## 6. Performance Audit

### 6.1 Code Splitting

| Strategy | Admin | Customer | Notes |
|---|---|---|---|
| Route-level lazy loading | ✅ `React.lazy` all pages | ✅ `React.lazy` all pages | Good |
| Manual chunk splitting | ✅ vendor, state, charts, ui | ✅ vendor, state, ui | Good |
| Dynamic imports | None beyond routes | None beyond routes | No feature-based splitting |

**Gaps:**
- `socket.io-client` (~50KB gzipped) not assigned to a chunk in admin — bundled into main
- `recharts` (~200KB) properly chunked in admin but loaded even for non-analytics pages (acceptable with lazy loading)

### 6.2 Lazy Loading

| Resource | Lazy Loaded? | Notes |
|---|---|---|
| Route pages | ✅ All pages | Via `React.lazy` + `Suspense` |
| Images | Partial | `loading="lazy"` on some `<img>` tags, missing on others |
| Components | ❌ None | Inline sub-components recreated every render |
| Fonts | ❌ | Google Fonts loaded in `<head>` — render-blocking |

### 6.3 Memoization

| Technique | Admin | Customer |
|---|---|---|
| `React.memo` | Only `Logo` component | Only `Logo` component |
| `useMemo` | None | `MenuPage` (3 memos), `CategoryPage` (1 memo) |
| `useCallback` | None | `MenuPage` (5), `CategoryPage` (5), `CartPage` (2) |
| Zustand selectors | Minimal | `cartStore` — fine-grained selectors used |

**Gaps:**
- Admin has **zero** `useMemo` or `useCallback` usage
- Inline sub-components (MetricCard, OrderColumn, OrderDetailModal, TableCard) are redefined on every render
- Context values recreated every render in both `SocketContext` providers

### 6.4 Re-Render Risks

| Risk | Location | Severity |
|---|---|---|
| Socket context value recreated every render | Both admin + customer `SocketContext.tsx` | High — all consumers re-render |
| Provider remounting on route change | Customer `App.tsx` `RestaurantProvider`/`SocketProvider` per route | High — socket reconnection, data refetch |
| Inline sub-components | Admin DashboardPage, OrdersPage, TablesPage | Medium — recreated every parent render |
| `newOrderIds` Set mutation | Admin `DashboardPage` | Medium — triggers re-render of all components |
| `framer-motion layout` prop | Admin MenuPage item grid | Medium — expensive layout calculations on filter change |
| `cartStore.totalItems()` method | Customer — called as function in selectors | Low — recomputed per call |

### 6.5 Bundle Inefficiencies

| Issue | Package | Estimated Waste |
|---|---|---|
| `dompurify` installed but never used | Both admin + customer | ~15KB gzipped |
| Dead components (5) included in bundle | Customer | ~30KB source (tree-shaken if unused, but barrel exports prevent tree-shaking) |
| Inline SVG icons (~100+ lines in nav array) | Admin DashboardLayout | ~5KB — should be extracted |
| Duplicate category data dictionaries | Customer MenuPage + CategoryPage | ~10KB source |

### 6.6 Large Dependency Warnings

| Dependency | Size (gzipped) | Used In | Justified? |
|---|---|---|---|
| `recharts` | ~200KB | Admin (analytics only) | Yes — properly chunked |
| `framer-motion` | ~130KB | Both packages | Customer: yes (gestures). Admin: questionable (only sidebar animation + layout) |
| `socket.io-client` | ~50KB | Both packages | Yes — real-time requirement |
| `dompurify` | ~15KB | Both packages | **No — never used** |

---

## 7. UI/UX Implementation Status

### 7.1 Mobile Responsiveness

**Customer App:** ✅ **Well-implemented**
- Mobile-first design with `lg:` desktop breakpoints
- Safe area handling (`safe-top`, `safe-bottom`) for notched devices
- Touch-optimized: `active:scale-95`, swipe-to-delete, large tap targets (mostly)
- Fixed bottom CTAs with `createPortal` for proper z-index
- Max container width: 480px (tight — may look cramped on larger phones like iPhone 15 Pro Max at 430px logical width)

**Admin Panel:** ❌ **Not responsive**
- Fixed sidebar with no hamburger menu or mobile nav
- On screens < 768px, sidebar overlaps or squeezes content
- No responsive table layouts — horizontal overflow on mobile
- No responsive modal sizing

### 7.2 Accessibility Issues

| Issue | Location | WCAG | Severity |
|---|---|---|---|
| `user-scalable=no` in meta viewport | Customer `index.html` | SC 1.4.4 (Resize Text) | **Critical** — prevents zoom on mobile |
| No `ErrorBoundary` — white screen on error | Both packages | SC 3.3.1 (Error Identification) | High |
| Modal lacks focus trap, `role="dialog"`, `aria-modal` | Admin OrdersPage | SC 2.4.3 (Focus Order) | High |
| Toggle switch lacks `role="switch"`, `aria-checked` | Admin SettingsPage | SC 4.1.2 (Name, Role, Value) | High |
| No `aria-label` on icon-only buttons | Both packages (extensively) | SC 4.1.2 | Medium |
| Loading screen has no `role="status"` or `aria-live` | Both packages | SC 4.1.3 (Status Messages) | Medium |
| Table rows clickable but no keyboard nav | Admin OrdersPage | SC 2.1.1 (Keyboard) | Medium |
| No skip navigation links | Both packages | SC 2.4.1 (Bypass Blocks) | Medium |
| `text-text-muted` (#94A3B8) on white — contrast ratio ~3.6:1 | Both packages | SC 1.4.3 (Contrast) | Medium — fails AA for body text |
| No `htmlFor` on some form labels | Admin SettingsPage | SC 1.3.1 (Info & Relationships) | Low |
| Color alone distinguishes primary from error (same red) | Admin Tailwind config | SC 1.4.1 (Use of Color) | Medium |
| No screen reader announcements for dynamic content | Both packages | SC 4.1.3 | Medium |

### 7.3 Inconsistent Spacing & Layout

- **Customer:** Consistent `mx-4 lg:mx-0` pattern with `rounded-2xl shadow-sm border border-gray-100` cards — well-systematized
- **Admin:** Uses custom Tailwind component classes (`.card`, `.btn`) which provides consistency, but inline sub-components sometimes use one-off spacing
- **Cross-package:** Admin uses dark theme tokens (`bg-surface`, `text-text-primary`) while customer uses Tailwind's standard gray scale — different design languages

### 7.4 Navigation Flow Gaps

| Gap | Package | Impact |
|---|---|---|
| No 404 page (admin) — redirects to dashboard | Admin | Users never know they typed a wrong URL |
| `navigate(-1)` for back button | Customer OrderStatusPage, NotFoundPage | Breaks when page is a direct link (no history) |
| Catch-all `*` redirect preserves wrong `from` location | Admin | After redirect, "where you came from" is `/dashboard`, not the original URL |
| No breadcrumbs | Both packages | Users lose context in deep navigation |
| No deep-linking for category within menu | Customer MenuPage | Must navigate to CategoryPage for per-category view |

### 7.5 UX Friction Points

1. **Lost cart on refresh** — Customer loses entire cart on page refresh
2. **No confirmation before order placement** — One tap places order
3. **No order cancellation** — Once placed, customers cannot cancel
4. **Demo credentials visible** — Admin login page shows demo email/password to all users
5. **Settings don't save** — Admin settings form pretends to save but does nothing
6. **Add Table button does nothing** — Admin tables page has dead CTA
7. **Menu create/edit forms missing** — Admin can see menu items but cannot add or edit
8. **QR code generation non-functional** — Opens `https://example.com/qr/...` in mock mode
9. **Audio notification with no user control** — New order plays sound with no mute toggle

---

## 8. API Layer Review

### 8.1 API Endpoints Mapped

**Authentication (4 endpoints):**
| Method | Path | Auth | Rate Limited |
|---|---|---|---|
| POST | `/api/auth/register` | None | `authLimiter` (10/15min) |
| POST | `/api/auth/login` | None | `authLimiter` (10/15min) |
| POST | `/api/auth/refresh` | None | **None** |
| POST | `/api/auth/logout` | None | None |
| POST | `/api/auth/logout-all` | Bearer | None |
| GET | `/api/auth/me` | Bearer | None |
| POST | `/api/auth/change-password` | Bearer | None |

**Menu (15 endpoints):**
| Method | Path | Auth | Roles |
|---|---|---|---|
| GET | `/api/menu/categories` | Bearer | Any |
| GET | `/api/menu/categories/:id` | Bearer | Any |
| POST | `/api/menu/categories` | Bearer | OWNER, ADMIN, MANAGER |
| PATCH | `/api/menu/categories/:id` | Bearer | OWNER, ADMIN, MANAGER |
| DELETE | `/api/menu/categories/:id` | Bearer | OWNER, ADMIN |
| GET | `/api/menu/items` | Bearer | Any |
| GET | `/api/menu/items/:id` | Bearer | Any |
| POST | `/api/menu/items` | Bearer | OWNER, ADMIN, MANAGER |
| PATCH | `/api/menu/items/:id` | Bearer | OWNER, ADMIN, MANAGER |
| DELETE | `/api/menu/items/:id` | Bearer | OWNER, ADMIN |
| PATCH | `/api/menu/items/availability` | Bearer | Any | **Unreachable — route ordering bug** |
| GET | `/api/menu/modifier-groups` | Bearer | Any |
| POST | `/api/menu/modifier-groups` | Bearer | OWNER, ADMIN, MANAGER |
| DELETE | `/api/menu/modifier-groups/:id` | Bearer | OWNER, ADMIN |

**Orders (7 endpoints):**
| Method | Path | Auth | Rate Limited |
|---|---|---|---|
| GET | `/api/orders` | Bearer | None |
| GET | `/api/orders/active` | Bearer | None |
| GET | `/api/orders/stats` | Bearer + OWNER/ADMIN/MANAGER | None |
| GET | `/api/orders/analytics` | Bearer + OWNER/ADMIN/MANAGER | None |
| GET | `/api/orders/:id` | Bearer | None |
| PATCH | `/api/orders/:id/status` | Bearer | None |
| POST | `/api/orders` | **None** | `orderLimiter` |

**Tables (9 endpoints):**
| Method | Path | Auth | Roles |
|---|---|---|---|
| GET | `/api/tables` | Bearer | Any |
| GET | `/api/tables/stats` | Bearer | Any |
| GET | `/api/tables/:id` | Bearer | Any |
| POST | `/api/tables` | Bearer | OWNER, ADMIN, MANAGER |
| POST | `/api/tables/bulk` | Bearer | OWNER, ADMIN |
| PATCH | `/api/tables/:id` | Bearer | OWNER, ADMIN, MANAGER |
| PATCH | `/api/tables/:id/status` | Bearer | **Any — no role check** |
| DELETE | `/api/tables/:id` | Bearer | OWNER, ADMIN |
| POST | `/api/tables/:id/regenerate-qr` | Bearer | OWNER, ADMIN, MANAGER |

**Restaurant (5 endpoints):**
| Method | Path | Auth | Roles |
|---|---|---|---|
| GET | `/api/restaurant` | Bearer | Any |
| GET | `/api/restaurant/dashboard` | Bearer | Any |
| GET | `/api/restaurant/users` | Bearer | OWNER, ADMIN |
| PATCH | `/api/restaurant` | Bearer | OWNER, ADMIN |
| PATCH | `/api/restaurant/settings` | Bearer | OWNER, ADMIN |

**Public (5 endpoints):**
| Method | Path | Auth | Rate Limited |
|---|---|---|---|
| GET | `/api/public/r/:slug` | None | Global only |
| GET | `/api/public/r/:slug/menu` | None | Global only |
| GET | `/api/public/tables/qr/:qrCode` | None | **None** |
| POST | `/api/public/r/:slug/orders` | None | `orderLimiter` (5/min) |
| GET | `/api/public/orders/:id/status` | None | **None** |

**Total: 45 API endpoints**

### 8.2 Hardcoded URLs

| Hardcoded Value | Location | Issue |
|---|---|---|
| `http://localhost:3001` | Customer `SocketContext.tsx` | Socket URL fallback |
| `http://localhost:3001` | Admin `SocketContext.tsx` | Socket URL fallback |
| `https://example.com/qr/{number}` | Admin `tableService.ts` (mock) | Non-functional QR URL |
| `https://images.unsplash.com/...` | Multiple mock data files | External image dependencies |
| `/r/demo-restaurant/t/1` | Customer `LandingPage.tsx` | Hardcoded demo route |

### 8.3 Missing Abstraction Layers

| Missing Layer | Impact |
|---|---|
| **No shared API type definitions** between admin/customer/backend | Type drift risk — each package defines its own types that may diverge |
| **No request interceptor for token refresh** | 401 errors cause hard redirect instead of transparent refresh |
| **No request cancellation (AbortController)** | React Query can't cancel in-flight requests on unmount |
| **No request timeout** | Hung requests never fail |
| **No response transformation layer** | Raw API responses leak into UI components |
| **No shared utilities package** (`@qr-order/shared`) | `formatPrice`, category icons, types duplicated |

### 8.4 Error Boundary Coverage

| Boundary | Exists? | Scope |
|---|---|---|
| React ErrorBoundary | **No** | Neither package has one — render errors crash the app |
| API error handler (backend) | Yes | Global Express error handler maps to HTTP codes |
| React Query error handling | Partial | Some mutations have `onError` with toast; queries show inline error UI |
| Socket error handling | Minimal | `socket.on('error')` logs to console only |

---

## 9. Bug & Risk Detection

### 9.1 Confirmed Bugs

| # | Bug | Location | Severity |
|---|---|---|---|
| 1 | **Analytics `groupBy(['createdAt'])` groups by exact timestamp** instead of date — daily revenue chart produces one entry per order | `backend/services/orderService.ts` `getAnalytics()` | **High** — analytics data completely wrong |
| 2 | **Route ordering: `PATCH /items/availability` defined after `PATCH /items/:id`** — Express matches `availability` as an `:id` param, making the availability endpoint unreachable | `backend/routes/menu.ts` | **High** — feature broken |
| 3 | **Admin auth persistence broken** — `isAuthenticated` not included in Zustand `partialize`, defaults to `false` on rehydrate, causing logout on every page refresh | `admin/state/authStore.ts` | **High** — unusable after refresh |
| 4 | **`POST /api/orders/` (admin route) crashes for unauthenticated calls** — `req.restaurantId!` is `undefined`, non-null assertion throws | `backend/routes/orders.ts` + controller | **Medium** — 500 error on malformed request |
| 5 | **Dynamic Tailwind class ``rounded-${...}``** not detected by Tailwind's JIT — missing from CSS bundle | `customer/pages/ItemDetailPage.tsx` | **Medium** — broken border radius |
| 6 | **Admin `UserRole` type mismatch** — mock user has `role: 'OWNER'` but type defines `'admin' \| 'staff'` | `admin/services/authService.ts` + `types/index.ts` | **Low** — TypeScript may not catch due to cast |
| 7 | **`PaginatedResponse` type vs mock return shape mismatch** — type has nested `pagination: {}` but mock returns flat `{ total, page, limit }` | `admin/services/orderService.ts` + `types/index.ts` | **Low** — works with mock, breaks with real API |
| 8 | **User email `@unique` constraint prevents multi-tenant email reuse** — composite unique on `(email, restaurantId)` is redundant | `backend/prisma/schema.prisma` | **Medium** — blocks multi-tenant intent |

### 9.2 Potential Runtime Errors

| # | Risk | Location | Trigger |
|---|---|---|---|
| 1 | **Missing dependency: `@socket.io/redis-adapter`** — imported in socket setup but not in `package.json` | `backend/src/socket/index.ts` | App startup |
| 2 | **Missing dependency: `dotenv`** — imported in config but not in `package.json` | `backend/src/config/index.ts` | App startup |
| 3 | **`new Date(string)` on unvalidated query params** — `dateFrom`/`dateTo` produce `Invalid Date` | `backend/controllers/orderController.ts` | API call with bad params |
| 4 | **`new Audio('/notification.mp3')` every new order** — if file missing, silent fail; browser autoplay may block | `admin/pages/DashboardPage.tsx` | New order notification |
| 5 | **`navigate(-1)` with no browser history** — navigates to empty history | `customer/pages/OrderStatusPage.tsx` | Direct link access |

### 9.3 Circular Dependencies

**None detected.** The dependency graph is acyclic:
- Pages → Services/State/Context → Types
- Context → Services → apiClient
- No reverse dependencies

### 9.4 Unused Variables / Imports

| File | Unused | Type |
|---|---|---|
| `admin/pages/MenuPage.tsx` | `_editingItem`, `_isCreatingItem` | Intentionally unused (underscore prefix) — dead state |
| `customer/components/index.ts` | `CartItemCard`, `CategoryScroller`, `HeaderBar`, `MenuItemCard`, `OrderSummaryPanel`, `QuantityStepper` | Exported but never imported by any page |
| `backend/types/index.ts` | `PaginationParams` | Defined, never used |
| `backend/validators/index.ts` | `createUserSchema`, `updateUserSchema`, `updateModifierGroupSchema`, `refreshTokenSchema`, `paginationSchema` | Defined, never applied to routes |

### 9.5 Console Warning Sources

| Source | Location | Production Risk |
|---|---|---|
| `console.log` on socket connect/disconnect/join/leave | Both SocketContext files, backend socket handler | Clutters production console |
| `console.error` on socket errors | Both SocketContext files | Acceptable for debugging |
| `console.error` on API validation failure | Backend config `index.ts` | Exits process — acceptable |
| React StrictMode double-render warnings | Both `main.tsx` | Dev-only, no production risk |

---

## 10. Technical Debt Report

### 10.1 Architectural Risks

| Risk | Impact | Complexity to Fix |
|---|---|---|
| **Provider remounting on every route change (Customer)** | Socket reconnections, data re-fetching, lost state | Medium — restructure to use layout routes |
| **No shared types package** | Type drift between frontend and backend leading to runtime mismatches | Medium — create `@qr-order/shared` |
| **Three state management solutions for admin auth** | Inconsistent state, difficult debugging | Low — remove redundant Context, derive `isAuthenticated` |
| **In-memory rate limiting** | Rate limits reset per instance in multi-server deployment | Low — swap to `rate-limit-redis` |
| **`KEYS` Redis command in production** | Redis blocks on large keyspaces, causing latency spikes | Low — replace with `SCAN` |
| **Socket emission in controllers** | Business logic coupled to HTTP layer, untestable | Medium — event emitter pattern |

### 10.2 Scalability Limitations

| Limitation | Impact at Scale |
|---|---|
| **No pagination UI** (admin orders, menu items) | UI freezes with 1000+ orders/items |
| **Full menu returned on public endpoints** | Response size grows linearly with menu size — no cursor pagination |
| **No database connection pooling configuration** | Default Prisma pool may be insufficient under load |
| **No CDN for static assets** | All images served from Unsplash (external dep) or origin server |
| **No read replicas** | Single PostgreSQL instance for all reads and writes |
| **Order number collision risk** | 4 random chars = ~1.6M possibilities/day — high-volume restaurants will collide |
| **`KEYS` command** | O(N) scan blocks Redis — unsustainable with growing cache |

### 10.3 Security Vulnerabilities

| # | Vulnerability | Risk Level | Fix Effort |
|---|---|---|---|
| 1 | Refresh tokens stored in plaintext in DB | **High** | Low — hash with SHA-256 |
| 2 | No validation on `PATCH /settings` — arbitrary JSON injection | **High** | Low — add Zod schema |
| 3 | Docker Compose JWT secret defaults | **High** | Low — remove defaults, require explicit env |
| 4 | Socket `join:table` has no authorization | **Medium** | Low — verify tableId ownership |
| 5 | Demo credentials displayed in production | **Medium** | Low — conditionally render |
| 6 | `dompurify` installed but never used — stored XSS possible | **Medium** | Low — implement sanitization |
| 7 | No CSP header | **Medium** | Medium — define policy |
| 8 | In-memory rate limiting bypassed in multi-instance | **Medium** | Low — use Redis store |
| 9 | QR codes predictable (not signed) | **Low** | Medium — HMAC signing |
| 10 | 10MB body size limit | **Low** | Low — reduce to 1MB |

### 10.4 Performance Bottlenecks

| # | Bottleneck | Impact | Fix Effort |
|---|---|---|---|
| 1 | DB query on every authenticated request (`authenticate` middleware) | High latency under load | Medium — cache user in Redis |
| 2 | Socket context value recreated every render | Cascading re-renders | Low — stabilize with `useMemo`/`useRef` |
| 3 | Provider remounting on route change | Redundant socket connections + data fetches | Medium — layout route refactor |
| 4 | No image optimization (no srcset, no blur placeholders) | Slow image loading, high bandwidth | Medium — implement responsive images |
| 5 | Inline sub-components in page files | Redefined on every render | Medium — extract and memo |
| 6 | `KEYS` Redis command | Blocks Redis event loop | Low — replace with SCAN |
| 7 | `dompurify` in bundle but unused | ~15KB wasted per package | Low — remove or use |

---

## 11. Immediate Action Recommendations

### Priority 1 — Critical Fixes (Do Before Any Deployment)

| # | Action | Location | Effort | Impact |
|---|---|---|---|---|
| 1.1 | **Fix admin auth persistence** — either persist `isAuthenticated` or derive from `user !== null` | `admin/state/authStore.ts` | 15 min | Users can refresh without logging out |
| 1.2 | **Add missing dependencies** — `dotenv` and `@socket.io/redis-adapter` to backend `package.json` | `backend/package.json` | 5 min | Prevents runtime crash on startup |
| 1.3 | **Fix route ordering** — move `PATCH /items/availability` BEFORE `PATCH /items/:id` | `backend/routes/menu.ts` | 5 min | Unblocks availability toggle feature |
| 1.4 | **Fix analytics groupBy** — group by date, not timestamp (use raw SQL or Prisma `$queryRaw`) | `backend/services/orderService.ts` | 30 min | Correct daily revenue chart |
| 1.5 | **Remove Docker Compose JWT secret defaults** — require explicit env vars | `docker-compose.yml` | 5 min | Prevents production with weak secrets |
| 1.6 | **Add Zod validation to `PATCH /settings`** | `backend/routes/restaurant.ts` | 20 min | Prevents arbitrary JSON injection |
| 1.7 | **Add `.env.example` files** for all three packages + root | Root, packages/* | 15 min | Developers can onboard without source diving |
| 1.8 | **Remove `user-scalable=no`** from customer `index.html` | `customer/index.html` | 1 min | WCAG compliance |
| 1.9 | **Fix dynamic Tailwind class** — change ``rounded-${...}`` to ternary with full strings | `customer/pages/ItemDetailPage.tsx` | 5 min | Correct border radius rendering |
| 1.10 | **Add React ErrorBoundary** to both admin and customer app shells | Both `App.tsx` | 30 min | Graceful error UI instead of white screen |

### Priority 2 — Stability Improvements (Next Sprint)

| # | Action | Location | Effort | Impact |
|---|---|---|---|---|
| 2.1 | **Restructure customer routes to use layout route** with shared `RestaurantProvider` + `SocketProvider` | `customer/App.tsx` | 2 hrs | Eliminates provider remounting, socket reconnections |
| 2.2 | **Add cart persistence** via `zustand/persist` with localStorage | `customer/state/cartStore.ts` | 30 min | Cart survives page refresh |
| 2.3 | **Extract shared utilities** — `formatPrice`, `categoryIcons`, `categoryImages`, `getStatusColor` | New `utils/` folder in customer, admin | 1 hr | Eliminates ~200 lines of duplication |
| 2.4 | **Implement admin menu create/edit forms** | `admin/pages/MenuPage.tsx` | 4 hrs | Core admin functionality |
| 2.5 | **Implement admin settings API integration** | `admin/pages/SettingsPage.tsx` | 2 hrs | Settings actually persist |
| 2.6 | **Switch `USE_MOCK` to environment variable** (`VITE_USE_MOCK`) | All service files | 30 min | No code change needed to switch modes |
| 2.7 | **Hash refresh tokens** before storing in DB | `backend/services/authService.ts` | 1 hr | Mitigates database breach impact |
| 2.8 | **Replace `KEYS` with `SCAN`** in Redis cache invalidation | `backend/lib/redis.ts` | 30 min | Non-blocking cache delete |
| 2.9 | **Add Redis-backed rate limiting** | `backend/middlewares/rateLimiter.ts` | 30 min | Rate limits work across instances |
| 2.10 | **Stabilize SocketContext value** with `useMemo`/`useRef` | Both `SocketContext.tsx` | 30 min | Eliminates cascading re-renders |
| 2.11 | **Remove dead code** — unused components, unused validators, unused middleware | Multiple files | 1 hr | Cleaner bundle, less confusion |
| 2.12 | **Add structured logging** (pino or winston) to backend | `backend/src/` | 2 hrs | Production debugging capability |
| 2.13 | **Log production errors** in error handler middleware | `backend/middlewares/errorHandler.ts` | 15 min | Critical operational visibility |

### Priority 3 — Optimization (Following Sprints)

| # | Action | Location | Effort | Impact |
|---|---|---|---|---|
| 3.1 | **Cache user data in Redis** during authentication | `backend/middlewares/auth.ts` | 1 hr | Eliminates DB query per request |
| 3.2 | **Add pagination UI** to admin orders and menu pages | Admin pages | 3 hrs | Handles large datasets |
| 3.3 | **Add `React.memo`** to extracted sub-components | Both packages | 2 hrs | Reduced re-renders |
| 3.4 | **Implement token refresh** flow with 401 retry interceptor | Both `apiClient.ts` | 2 hrs | Seamless auth experience |
| 3.5 | **Add AbortController** support to apiClient | Both `apiClient.ts` | 1 hr | Proper request cancellation |
| 3.6 | **Create `@qr-order/shared` package** for cross-package types and utils | New package | 4 hrs | Single source of truth for types |
| 3.7 | **Add modal focus traps, ARIA roles, keyboard navigation** | Admin modals, interactive elements | 3 hrs | WCAG compliance |
| 3.8 | **Implement CSP header** | Backend `helmet()` config + Nginx | 2 hrs | XSS mitigation |
| 3.9 | **Add responsive admin layout** with mobile hamburger menu | `admin/layouts/DashboardLayout.tsx` | 3 hrs | Admin usable on mobile |
| 3.10 | **Implement DOMPurify** sanitization on user-generated content display | Both packages (special instructions, notes) | 1 hr | Stored XSS prevention |
| 3.11 | **Add comprehensive test suite** (Vitest + React Testing Library) | Both packages + backend | 20+ hrs | Regression prevention |
| 3.12 | **Implement order cancellation UI** and wire to existing backend | `customer/pages/OrderStatusPage.tsx` | 2 hrs | Complete order lifecycle |
| 3.13 | **Remove `dompurify`** if not implementing sanitization, or implement it | Both packages | 15 min | Clean bundle |
| 3.14 | **Add order number collision mitigation** — increase random chars from 4 to 8 | `backend/services/orderService.ts` | 15 min | Higher throughput safety |
| 3.15 | **Implement socket authentication** — pass JWT token in socket handshake | Both SocketContexts + backend socket handler | 2 hrs | Prevents unauthorized real-time access |

---

## Summary Statistics

| Metric | Value |
|---|---|
| **Total API Endpoints** | 45 |
| **Total Source Files** | ~65 |
| **Dead Code Files** | 8 (customer components) + 6 (backend dead validators/middleware) |
| **Confirmed Bugs** | 8 |
| **Security Vulnerabilities** | 10 |
| **WCAG Violations** | 11 |
| **Duplicated Code** | ~200+ lines |
| **Missing Core Features** | 12 |
| **Test Coverage** | 0% |

---

*End of audit.*
