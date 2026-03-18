# Deployment Guide — QR Order Web

This guide covers switching between **local development** and **live production** environments.

---

## Architecture Overview

| Layer | Local | Production (VPS) |
|---|---|---|
| Backend API | `http://localhost:3000` | `https://api.infynarc.com` |
| Admin panel | `http://localhost:5174` | `https://qorderadmin.infynarc.com` |
| Customer app | `http://localhost:5173` | `https://qorderscan.infynarc.com` |
| Database | Supabase (same DB for both) | Supabase (same DB for both) |
| Redis | Local Docker / Upstash | Upstash (via `REDIS_URL` in backend `.env`) |

> **Note:** Both local and production connect to the **same Supabase database**. Be careful running destructive operations locally — they affect live data.

---

## Switching to Local Development

### 1. `packages/backend/.env`

Change these two lines:

```env
NODE_ENV=development
CORS_ORIGIN="http://localhost:5173,http://localhost:5174"
```

Everything else (DATABASE_URL, JWT secrets, SMTP, Twilio, API keys) stays the same.

### 2. `packages/admin/.env`

```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
VITE_CUSTOMER_URL=http://localhost:5173
```

### 3. `packages/customer/.env`

```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

### 4. Start local dev servers

```bash
# Install dependencies (first time only)
npm install

# Run all services in parallel
npm run dev
```

Or with Docker (hot-reload):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Switching Back to Production

### Step 1 — Fix the 3 local env files

#### `packages/backend/.env`

Change back:

```env
NODE_ENV=production
CORS_ORIGIN="https://qorderadmin.infynarc.com,https://qorderscan.infynarc.com"
```

#### `packages/admin/.env`

```env
VITE_API_URL=https://api.infynarc.com/api
VITE_SOCKET_URL=https://api.infynarc.com
VITE_CUSTOMER_URL=https://qorderscan.infynarc.com
```

#### `packages/customer/.env`

```env
VITE_API_URL=https://api.infynarc.com/api
VITE_SOCKET_URL=https://api.infynarc.com
```

### Step 2 — Commit and push code changes to GitHub

```bash
git add .
git commit -m "your message"
git push origin main
```

### Step 3 — SSH into VPS

```bash
ssh root@srv1488215
cd ~/qr_order_web
```

### Step 4 — Pull latest code

```bash
git pull origin main
```

### Step 5 — Check VPS root `.env`

The file `~/qr_order_web/.env` on the VPS drives all Docker build args. Verify it has:

```env
JWT_ACCESS_SECRET=CdvI/bqTJfF3jE1CBQtEOAx5GgpEqTYVaSdJbZ8Dd8aSunK7nsW7uDNlhky7/k3q
JWT_REFRESH_SECRET=IqCMxGL7+J1+Az6LxnLf2PqLst4pOHMwk9ivQxTWAjHPDsEc7gQ6/qIcvNyuxIyz
CORS_ORIGIN=https://qorderadmin.infynarc.com,https://qorderscan.infynarc.com
VITE_API_URL=https://api.infynarc.com/api
VITE_SOCKET_URL=https://api.infynarc.com
VITE_CUSTOMER_URL=https://qorderscan.infynarc.com
REDIS_PASSWORD=<your redis password>
```

### Step 6 — Rebuild and restart containers

**Backend only** (no schema changes):
```bash
docker compose up -d --build backend
```

**Admin panel only** (frontend UI changes):
```bash
docker compose up -d --build admin
```

**Customer app only**:
```bash
docker compose up -d --build customer
```

**Everything** (full redeploy):
```bash
docker compose up -d --build
```

### Step 7 — If Prisma schema changed

Run this **after** the build completes:

```bash
docker compose exec backend npx prisma db push \
  --schema packages/backend/prisma/schema.prisma \
  --accept-data-loss
```

Then restart backend to pick up the new Prisma client:

```bash
docker compose restart backend
```

### Step 8 — Verify deployment

```bash
docker compose ps
docker compose logs backend --tail=20
```

Expected output:
- All containers: `Up` with `(healthy)` for backend and redis
- Backend log: `Server running — HTTP :3000 | WS :3000`

---

## Quick Reference — Which Container to Rebuild

| What changed | Command |
|---|---|
| Backend code / API routes / services | `docker compose up -d --build backend` |
| Admin UI (React components, pages) | `docker compose up -d --build admin` |
| Customer app (React) | `docker compose up -d --build customer` |
| Prisma schema (`schema.prisma`) | build backend → `prisma db push` → `restart backend` |
| Everything | `docker compose up -d --build` |

---

## Prisma Schema Sync (when schema.prisma changes)

```bash
# 1. Build the backend first (generates new Prisma client in container)
docker compose up -d --build backend

# 2. Push schema changes to the database
docker compose exec backend npx prisma db push \
  --schema packages/backend/prisma/schema.prisma \
  --accept-data-loss

# 3. Restart to reload the new client
docker compose restart backend
```

> `--accept-data-loss` is required when dropping columns or tables. It does NOT delete rows — only the columns/tables you removed from the schema.

---

## File Map Summary

| File | Purpose | Local value | Production value |
|---|---|---|---|
| `packages/backend/.env` | Backend runtime config | `NODE_ENV=development`, localhost CORS | `NODE_ENV=production`, domain CORS |
| `packages/admin/.env` | Vite build-time URLs (local dev) | `localhost:3000` | `api.infynarc.com` |
| `packages/customer/.env` | Vite build-time URLs (local dev) | `localhost:3000` | `api.infynarc.com` |
| `.env` (root, VPS only) | Docker Compose build args on VPS | — | production domains + secrets |
| `packages/admin/.env.production` | Reference copy of prod admin URLs | — | `api.infynarc.com` URLs |
| `packages/customer/.env.production` | Reference copy of prod customer URLs | — | `api.infynarc.com` URLs |

---

## VPS Details

| Item | Value |
|---|---|
| Host | `srv1488215` (Hostinger VPS) |
| Project path | `~/qr_order_web` |
| Backend port | `3000` |
| Admin port | `5174` |
| Customer port | `5173` |
| Database | Supabase — `aws-1-ap-south-1.pooler.supabase.com:5432` |

---

## Common Issues

**Backend unhealthy after deploy**
```bash
docker compose logs backend --tail=30
# Look for startup errors, then:
docker compose restart backend
```

**Frontend shows old version (cached)**
- Hard refresh in browser: `Ctrl + Shift + R`
- Or rebuild: `docker compose up -d --build admin`

**Prisma schema not found error**
```bash
# Always use the full path inside the container:
docker compose exec backend npx prisma db push \
  --schema packages/backend/prisma/schema.prisma \
  --accept-data-loss
```

**CORS errors in browser**
- Check `CORS_ORIGIN` in VPS root `.env` matches the exact domain (no trailing slash)
- Rebuild backend after changing: `docker compose up -d --build backend`
