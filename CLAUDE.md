# QR Order Web — Claude Instructions

## Project Overview
Multi-tenant QR-based restaurant ordering SaaS. npm workspaces monorepo with three packages:
- `packages/admin` — Staff/owner admin panel (React, Vite, port 5173)
- `packages/customer` — Customer-facing PWA for ordering (React, Vite, port 5174)
- `packages/backend` — REST API + WebSocket server (Express, port 3000)

## Tech Stack
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Zustand, React Query (TanStack v5), Framer Motion, Socket.io Client
- **Backend:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Redis, Socket.io
- **Auth:** JWT (HttpOnly cookies), access token in memory only (XSS protection), refresh token 7d
- **Validation:** Zod (backend validators at `packages/backend/src/validators/index.ts`)
- **Real-time:** Socket.io with Redis adapter for scaling
- **Payments:** Razorpay
- **Comms:** Twilio (OTP + WhatsApp), Nodemailer (Gmail SMTP)
- **AI:** OpenAI + Google Gemini (chatbot)
- **Biometrics:** Mantra MFS100 fingerprint scanner via WebSocket bridge on port 9200

## Key Commands
```bash
npm run dev              # Run all 3 servers concurrently
npm run dev:admin        # Admin only (port 5173)
npm run dev:customer     # Customer only (port 5174)
npm run dev:backend      # Backend only (port 3000)
npm run build            # Build all packages
npm run db:migrate       # Prisma migrate dev
npm run db:generate      # Regenerate Prisma client
npm run db:seed          # Seed database
npm run type-check       # TypeScript check all workspaces
```

## Project Structure Conventions

### Backend (`packages/backend/src/`)
- `controllers/` — HTTP handlers, one file per resource
- `services/` — Business logic, one file per domain
- `routes/` — Express routers, all mounted in `routes/index.ts`
- `validators/index.ts` — All Zod schemas
- `config/index.ts` — Env vars validated with Zod
- `middleware/` — Auth, rate limiting, error handling
- `prisma/schema.prisma` — Single source of truth for DB schema

### Frontend (`packages/admin/src/` and `packages/customer/src/`)
- `pages/` — Route-level components
- `components/` — Reusable UI components
- `services/` — API client calls (axios wrappers)
- `context/` — React contexts (AuthContext, SocketContext)
- `state/` — Zustand stores with localStorage persistence
- `hooks/` — Custom React hooks

## Naming Conventions
- Components/Pages: PascalCase (`OrdersPage.tsx`, `MenuCard.tsx`)
- Services/hooks/stores: camelCase (`orderService.ts`, `useIdleLock.ts`, `authStore.ts`)
- Types/Interfaces: PascalCase imported from `../types`
- Backend services: suffix `Service` (`orderService`, `emailService`)
- Constants: UPPER_SNAKE_CASE

## Multi-tenant Architecture
Every DB query is scoped by `restaurantId`. Never query without tenant isolation. Prisma enforces this via row-level security (RLS) in PostgreSQL.

## Authentication Pattern
- Access token: short-lived (15m), stored in memory only
- Refresh token: 7 days, HttpOnly cookie
- User persisted to localStorage (sans token) via Zustand persist
- Roles: `OWNER > ADMIN > MANAGER > STAFF`

## Socket Events (SocketContext)
Use the event subscription pattern — returns an unsubscribe function:
```ts
const unsub = onOrderStatusUpdate((data) => { ... });
return unsub; // in useEffect cleanup
```
Key events: `newOrder`, `newOrderFull`, `orderStatusUpdate`, `kitchenReady`, `itemKitchenReady`, `tableUpdate`, `tableUpdated`, `sessionUpdated`, `serviceRequest`

## Environment Files
- `packages/backend/.env` — DB, Redis, JWT, SMTP, Twilio, AI keys
- `packages/admin/.env` — `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_CUSTOMER_URL`
- `packages/customer/.env` — `VITE_API_URL`, `VITE_SOCKET_URL`
- Production values in `.env.production` files (do not edit during local dev)

## Important Notes
- Do NOT touch the fingerprint bridge code unless specifically asked
- Do NOT modify `prisma/schema.prisma` without running `db:generate` after
- The `packages/admin` runs on port 5173, `packages/customer` on 5174 (forced via `vite --port`)
- Docker deployment uses nginx for frontend; local dev uses Vite HMR
- Prisma client is generated into `node_modules` — always run `db:generate` after schema changes
