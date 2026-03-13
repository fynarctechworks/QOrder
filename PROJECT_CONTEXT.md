# QR Order Web — Project Context Document

> **Generated**: February 17, 2026
> **Purpose**: Complete project state reference for onboarding another AI or developer.

---

## 1. Overview

**QR Order Web** is a restaurant QR-code ordering system. Customers scan a table QR code, browse the menu, add items to cart (with modifier/customization support), place orders, and track order status in real-time. Restaurant staff manage menus, tables, and orders via an admin dashboard.

**App Name**: "Q Order" (customer), "Q Order Admin" (admin)

---

## 2. Architecture

### Monorepo Structure (npm workspaces)

```
qr_order_web/
├── package.json              # Root — workspaces: ["packages/*"]
├── docker-compose.yml        # Production Docker Compose
├── docker-compose.dev.yml    # Dev Docker Compose
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf
└── packages/
    ├── customer/             # Vite + React 18 + TypeScript — Port 5173
    ├── admin/                # Vite + React 18 + TypeScript — Port 5174
    └── backend/              # Express + TypeScript + Prisma — Port 3000 (+ fingerprint bridge on port 9200)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend (both)** | React 18.2, TypeScript 5.3, Vite 5.0, Tailwind CSS 3.4 |
| **State (customer)** | Zustand (cart, UI), React Query (server state), React Context (restaurant, socket) |
| **State (admin)** | Zustand (auth), React Query (server state), React Context (auth, socket) |
| **Animations** | Framer Motion |
| **Backend** | Express.js, TypeScript, Prisma ORM |
| **Database** | PostgreSQL (multi-tenant with row-level relations) |
| **Caching** | Redis |
| **Real-time** | Socket.IO (order status updates) |
| **Auth** | JWT (access + refresh tokens), bcrypt |

---

## 3. Brand / Design Tokens

### Colors (both packages)

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#FAF9F6` | Page background (warm off-white) |
| `primary.DEFAULT` | `#6F4E37` | Buttons, header, accents (brown) |
| `primary.hover` | `#5E422F` | Hover state for primary |
| `primary.light` | `#8B6B53` | Lighter brown accent |
| `primary.foreground` | `#FFFFFF` | Text on primary bg |
| `primary.muted` | `rgba(111, 78, 55, 0.1)` | Customer only — subtle tint |
| `success` | `#16A34A` | Success states |
| `error` | `#DC2626` | Error states (semantic only) |
| `warning` | `#D97706` | Warning states |
| `text.primary` | `#0F172A` | Main text |
| `text.secondary` | `#475569` | Secondary text |
| `text.muted` | `#94A3B8` | Muted/placeholder text |

**WCAG**: `#6F4E37` on `#FAF9F6` ≈ 8:1 ratio, `#FFFFFF` on `#6F4E37` ≈ 8.4:1 ratio.

### Customer-specific tokens

- `background-secondary`: `#F8FAFC`
- `surface.DEFAULT`: `#F1F5F9`, `surface.elevated`: `#FFFFFF`, `surface.border`: `#E2E8F0`
- Box shadows: `soft`, `card`, `elevated`, `glow` (brown-tinted: `rgba(111, 78, 55, 0.25)`)
- Font: Inter

### Logo

- File: `/4.jpg` (in both `public/` directories)
- Applied with `rounded-2xl` border radius where shown
- Favicons set to `/4.jpg` with `type="image/jpeg"` in both `index.html` files

### IMPORTANT: No hardcoded red

All `red-*` Tailwind classes have been replaced with `primary` token equivalents across the entire customer package. The `error` token (`#DC2626`) is only used for semantic error states in the design system, not for brand/UI accents.

---

## 4. Customer App (`packages/customer`)

### Routing (`App.tsx`)

```
/                                          → LandingPage
/r/:restaurantSlug/t/:tableId             → RestaurantLayout (wraps below)
  ├── index                                → MenuPage
  ├── category/:categoryId                 → CategoryPage
  ├── item/:itemId                         → ItemDetailPage
  └── cart                                 → CartPage
/order-status/:orderId                     → OrderStatusPage (own SocketProvider)
```

### Layout: `RestaurantLayout.tsx`

Wraps all restaurant-scoped routes:
- `RestaurantProvider` → loads restaurant + table data from API
- `SocketProvider` → WebSocket connection for real-time order updates
- `AnimatedPage` → Framer Motion page transitions
- `<div className="pb-16">` → bottom padding for BottomNav
- `<BottomNav />` → fixed bottom navigation

### Key Components

#### `BottomNav.tsx`
- Fixed bottom navigation bar (`z-[9998]`, `h-16`, `bg-white`, `border-t`)
- Three tabs: **Home** (menu/categories), **Orders**, **Pay Bill**
- Active state: `text-primary` with filled icon; inactive: `text-gray-400` with outlined icon
- Auto-hides on cart page
- Routes: `''` (home), `'orders'`, `'pay'`
- Note: Orders and Pay Bill pages are **not yet implemented** — the routes exist in BottomNav but no corresponding page components

#### `FloatingCartButton.tsx` (Blinkit-style)
- Portal rendered on `document.body` (`z-[9999]`)
- Positioned at `bottom-[4.5rem]` (above BottomNav)
- Shows when `totalItems > 0 && !isCartPage && !isOrderPage && !isDrawerOpen`
- **Hides when ItemDetailDrawer is open** via `useUIStore.isDrawerOpen`
- Layout: Stacked product thumbnails (max 3, overlapping) | "View cart" + item count | Chevron circle button
- Animations: Slide-up on appear, bounce on item count change
- Primary brown background (`bg-primary`)

#### `ItemDetailDrawer.tsx`
- Bottom sheet drawer for item customizations/modifiers
- `z-[10001]` (above FloatingCartButton), backdrop at `z-[10000]`
- Spring animation via Framer Motion
- Sets `useUIStore.setDrawerOpen(true/false)` on open/close
- Supports: quantity, customization groups (required/optional), special instructions
- Validation for required customization groups

### State Management

#### `cartStore.ts` (Zustand + persist + immer)
- `items: CartItem[]`, `restaurantId`, `tableId`
- Actions: `addItem`, `updateItemQuantity`, `removeItem`, `clearCart`
- Computed: `totalItems()`, `subtotal()`
- Persisted to localStorage
- Auto-clears cart when switching restaurants

#### `uiStore.ts` (Zustand)
- `isDrawerOpen: boolean` — synced by ItemDetailDrawer
- Used by FloatingCartButton to hide when drawer is open

### Pages

#### `LandingPage.tsx`
- Splash/entry page at `/`
- Container card layout: Logo (rounded-2xl, size 80), "Q Order" name, "Order Now" button
- No features grid or trust strip (removed)

#### `MenuPage.tsx` (Swiggy/Instamart-style design)
- **Sticky header**: Primary brown colored flat section
  - "NOW SERVING" label → restaurant name → table number
  - Cart icon button (top-right) with badge count
- **Search bar**: Below header, `rounded-xl`, with focus ring animation
- **Category grid**: 3-col (responsive), pastel background cards (`bg-rose-50`, `bg-amber-50`, etc.), category images
- **Popular dishes**: 2-col grid, image cards with add/quantity controls overlay
  - Items with customizations open the ItemDetailDrawer
  - Items without customizations add directly to cart
- **Search results**: Compact grid view with optimized spacing, ADD buttons
- `FloatingCartButton` rendered at bottom
- `ItemDetailDrawer` for modifier selection

#### `CategoryPage.tsx`
- Category-specific item listing
- Uses `FloatingCartButton` and `ItemDetailDrawer`

#### `CartPage.tsx`
- Full cart view with quantity controls
- Special instructions per item
- Place order button
- All red→primary color conversion done

#### `OrderStatusPage.tsx`
- Real-time order tracking via WebSocket
- Stepper visualization (pending→confirmed→preparing→ready→delivered)
- Cancel order functionality
- All red→primary color conversion done

#### `ItemDetailPage.tsx`
- Full-page item detail view (alternative to drawer)
- Image, description, allergens, customizations
- All red→primary color conversion done

### Utilities

- `formatPrice.ts` — Currency formatting
- `formatCurrency.ts` — Alternate currency util
- `categoryData.ts` — Maps category names to icons/images
- `sanitize.ts` — Input sanitization

### Services

- `restaurantService.ts` — API calls for restaurant, categories, menu items, tables
- Other service files for orders, auth, etc.

---

## 5. Admin App (`packages/admin`)

### Pages
- `LoginPage.tsx` — Logo with `rounded-2xl`, "Q Order Admin" title
- `DashboardPage.tsx` — Overview stats
- `MenuPage.tsx` — Menu management (CRUD)
- `OrdersPage.tsx` — Order management with real-time updates
- `TablesPage.tsx` — Table management
- `SettingsPage.tsx` — Restaurant settings
- `AnalyticsPage.tsx` — Analytics dashboard

### Layout
- `DashboardLayout.tsx` — Sidebar with "Q Order" brand, navigation

### State
- `authStore.ts` — Zustand-based auth state

### Colors
- Same design token system as customer (brown primary `#6F4E37`, off-white background `#FAF9F6`)

---

## 6. Backend (`packages/backend`)

### Structure
```
src/
├── app.ts              # Express app setup
├── index.ts            # Server entry point
├── config/             # Environment config
├── controllers/        # Route handlers
│   ├── authController.ts
│   ├── menuController.ts
│   ├── orderController.ts
│   ├── restaurantController.ts
│   └── tableController.ts
├── lib/                # Core utilities
│   ├── errors.ts       # Custom error classes
│   ├── logger.ts       # Winston logger
│   ├── prisma.ts       # Prisma client singleton
│   └── redis.ts        # Redis client
├── middlewares/         # Express middleware
│   ├── auth.ts         # JWT auth middleware
│   ├── errorHandler.ts # Global error handler
│   ├── rateLimiter.ts  # Rate limiting
│   └── validate.ts     # Request validation
├── routes/             # Express routes
│   ├── auth.ts
│   ├── menu.ts
│   ├── orders.ts
│   ├── public.ts       # Public API (no auth)
│   ├── restaurant.ts
│   └── tables.ts
├── scripts/
│   └── seed.ts         # Database seeder (name: "Q Order")
├── services/           # Business logic
│   ├── authService.ts
│   ├── menuService.ts
│   ├── orderService.ts
│   ├── biometricService.ts  # Fingerprint enrollment, verification, attendance
│   └── ...
├── fingerprint-bridge/ # Embedded fingerprint scanner bridge (WebSocket on port 9200)
│   ├── index.ts        # startFingerprintBridge() / stopFingerprintBridge()
│   ├── adapters/       # Scanner adapters (mantra, simulate, secugen, digitalpersona)
│   └── scripts/        # Native SDK helper scripts (mantra-helper.ps1)
├── socket/             # Socket.IO handlers
├── types/              # TypeScript types
└── validators/         # Zod/Joi schemas
```

### Database Schema (Prisma + PostgreSQL)

**Models**: Restaurant, User, RefreshToken, Category, MenuItem, ModifierGroup, Modifier, MenuItemModifierGroup, Table, Order, OrderItem, OrderItemModifier, BiometricDevice, BiometricTemplate, BiometricLog, BiometricUserMap, Attendance

**Key relationships**:
- Everything is multi-tenant via `restaurantId`
- MenuItem → Category (many-to-one)
- MenuItem ↔ ModifierGroup (many-to-many via MenuItemModifierGroup)
- Order → Table, Order → OrderItem → MenuItem
- OrderItem → OrderItemModifier → Modifier

**Enums**: `UserRole` (OWNER, ADMIN, MANAGER, STAFF), `TableStatus` (AVAILABLE, OCCUPIED, RESERVED, INACTIVE), `OrderStatus` (PENDING→CONFIRMED→PREPARING→READY→DELIVERED→COMPLETED→CANCELLED), `PaymentStatus` (PENDING, PAID, REFUNDED, FAILED)

---

## 7. TypeScript Types (Customer)

```typescript
interface MenuItem {
  id, categoryId, name, description, price, imageUrl?, isAvailable,
  preparationTime, allergens[], ingredients[], customizationGroups[], tags[]
}

interface CartItem {
  id, menuItem: MenuItem, quantity, selectedCustomizations[], specialInstructions?, totalPrice
}

interface SelectedCustomization {
  groupId, groupName, options: SelectedOption[]
}

interface SelectedOption { id, name, priceModifier }
```

---

## 8. Z-Index Stacking Order (Customer)

| Layer | Z-Index | Component |
|-------|---------|-----------|
| Header (sticky) | `z-50` | MenuPage header |
| BottomNav | `z-[9998]` | Fixed bottom nav |
| FloatingCartButton | `z-[9999]` | Portal on `document.body` |
| ItemDetailDrawer backdrop | `z-[10000]` | Modal overlay |
| ItemDetailDrawer panel | `z-[10001]` | Bottom sheet |

---

## 9. Docker & Infrastructure

- `docker-compose.yml` — Production with nginx reverse proxy
- `docker-compose.dev.yml` — Dev environment
- `Dockerfile.backend` / `Dockerfile.frontend` — Container builds
- `nginx.conf` — Proxy config

---

## 10. Scripts

```bash
npm run dev              # Run all 3 packages concurrently
npm run dev:customer     # Customer only (port 5173)
npm run dev:admin        # Admin only (port 5174)
npm run dev:backend      # Backend only (port 3000)
npm run build            # Build all
npm run db:migrate       # Run Prisma migrations
npm run db:generate      # Generate Prisma client
npm run db:seed          # Seed database
```

---

## 11. Known Gaps / Not Yet Implemented

1. **Orders page** (customer) — BottomNav has "Orders" tab but no page component exists for `/r/:slug/t/:id/orders`
2. **Pay Bill page** (customer) — BottomNav has "Pay Bill" tab but no page component exists for `/r/:slug/t/:id/pay`
3. **Payment integration** — PaymentStatus enum exists but no payment gateway is wired
4. **Push notifications** — Not implemented
5. **Admin menu CRUD forms** — May be incomplete
6. **Settings persistence** — Admin settings page may not save to backend
7. **Image uploads** — No cloud storage integration visible
8. **Cart persistence across sessions** — Cart is persisted via Zustand `persist` middleware to localStorage

---

## 12. File Quick Reference

### Customer — Files Modified from Original

| File | Key Changes |
|------|------------|
| `tailwind.config.js` | Brown primary palette, custom shadows/animations |
| `index.html` | Favicon `/4.jpg`, title "Q Order" |
| `index.css` | Global scrollbar hiding for clean UI |
| `src/App.tsx` | Lazy-loaded pages, RestaurantLayout |
| `src/layouts/RestaurantLayout.tsx` | BottomNav + pb-16 wrapper |
| `src/components/BottomNav.tsx` | **NEW** — Fixed bottom nav (Home, Orders, Pay Bill), full-width on all screens |
| `src/components/FloatingCartButton.tsx` | Blinkit-style: thumbnails, slide-up, bounce, hides when drawer open |
| `src/components/ItemDetailDrawer.tsx` | z-[10001], syncs `uiStore.isDrawerOpen` |
| `src/components/Logo.tsx` | src="/4.jpg", alt="Q Order Logo" |
| `src/components/ErrorBoundary.tsx` | red→primary colors |
| `src/components/OrderStatusStepper.tsx` | red→primary colors |
| `src/state/uiStore.ts` | **NEW** — `isDrawerOpen` flag for drawer/cart coordination |
| `src/pages/LandingPage.tsx` | Simplified container card, "Q Order", no features |
| `src/pages/MenuPage.tsx` | Full redesign: flat brown header + search + category grid + popular dishes + optimized search results |
| `src/pages/CartPage.tsx` | red→primary colors, bg-background |
| `src/pages/OrderStatusPage.tsx` | red→primary colors, bg-background |
| `src/pages/ItemDetailPage.tsx` | red→primary colors |
| `src/services/mockData.ts` | primaryColor: '#6F4E37', name: 'Q Order' |

### Admin — Files Modified

| File | Key Changes |
|------|------------|
| `tailwind.config.js` | Brown primary palette |
| `index.html` | Favicon `/4.jpg`, title "Q Order Admin" |
| `src/components/Logo.tsx` | src="/4.jpg", alt="Q Order Logo" |
| `src/pages/LoginPage.tsx` | Logo rounded-2xl, "Q Order Admin" |
| `src/layouts/DashboardLayout.tsx` | "Q Order" sidebar brand |

### Backend — Files Modified

| File | Key Changes |
|------|------------|
| `src/scripts/seed.ts` | name: 'Q Order' |

---

## Biometric Fingerprint Attendance

### Overview
Staff attendance via USB fingerprint scanners. The fingerprint bridge runs embedded in the backend (WebSocket on port 9200).

### Architecture
- **Bridge**: `packages/backend/src/fingerprint-bridge/` — starts with backend, runs WebSocket server on `ws://127.0.0.1:9200`
- **Adapter pattern**: Auto-detects scanner hardware (mantra → secugen → digitalpersona → simulate)
- **Mantra MFS100**: Native .NET SDK via 32-bit PowerShell helper script (`mantra-helper.ps1`)
- **Templates**: AES-256-CBC encrypted in DB, decrypted only for local matching
- **Matching**: Done bridge-side using scanner SDK (ISO template matching)

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `FINGERPRINT_BRIDGE_PORT` | `9200` | WebSocket port |
| `FINGERPRINT_BRIDGE_ADAPTER` | `auto` | Force adapter: mantra, simulate, auto |
| `FINGERPRINT_BRIDGE_DISABLED` | `false` | Set to true to disable |
| `BIOMETRIC_ENCRYPTION_KEY` | — | AES-256 key for template encryption |

### API Endpoints (`/api/biometric/`)
- **Devices**: GET/POST/PATCH/DELETE `/devices`, POST `/devices/test`, GET `/devices/:id/users`, POST `/devices/:id/sync`
- **Enrollment**: POST `/enroll`, GET/DELETE `/templates/:userId`, GET `/templates/:userId/verify`
- **Attendance**: POST `/verify`, GET `/logs`, GET `/enrollment-status`, GET `/failed-attempts`, GET `/daily-attendance/:date`
