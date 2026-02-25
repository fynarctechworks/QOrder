# QR Order - Restaurant Ordering SaaS

A production-grade, mobile-first Progressive Web App (PWA) for QR-based restaurant ordering. This multi-tenant SaaS platform enables restaurants to offer contactless ordering through QR codes placed on tables.

## Features

### Customer App (PWA)
- 📱 Mobile-first design with 8px grid system
- 🔍 Menu browsing with category filtering
- 🛒 Cart management with modifiers support
- 📍 QR code-based table detection
- 🔔 Real-time order status tracking via WebSocket
- ⚡ Offline support with service worker
- 🎨 Dark theme optimized for restaurant ambiance

### Admin Panel
- 📊 Real-time dashboard with key metrics
- 📋 Order management with status workflow
- 🍽️ Menu management (categories, items, modifiers)
- 🪑 Table management with QR code generation
- 📈 Analytics and reporting
- ⚙️ Restaurant settings configuration

### Backend
- 🔐 JWT authentication with refresh tokens
- 🔒 Role-based access control (Owner, Admin, Manager, Staff)
- 🏢 Multi-tenant architecture with row-level isolation
- 🔌 Real-time events via Socket.io with Redis adapter
- 💾 PostgreSQL database with Prisma ORM
- ⚡ Redis caching for performance
- 🛡️ Rate limiting and security middleware

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS |
| **State** | Zustand, React Query |
| **Real-time** | Socket.io Client |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL, Prisma ORM |
| **Cache** | Redis |
| **Auth** | JWT (HttpOnly cookies) |
| **Validation** | Zod |
| **Deployment** | Docker, GitHub Actions |

## Project Structure

```
qr_order_web/
├── packages/
│   ├── customer/          # Customer PWA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── state/
│   │   │   └── context/
│   │   └── ...
│   ├── admin/             # Admin Panel
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── state/
│   │   │   └── layouts/
│   │   └── ...
│   └── backend/           # API Server
│       ├── src/
│       │   ├── controllers/
│       │   ├── services/
│       │   ├── middlewares/
│       │   ├── routes/
│       │   ├── validators/
│       │   ├── socket/
│       │   └── lib/
│       └── prisma/
├── docker-compose.yml
└── .github/workflows/
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- npm 10+

### Development Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd qr_order_web
   npm install
   ```

2. **Start PostgreSQL and Redis:**
   ```bash
   # Using Docker
   docker-compose up -d postgres redis
   
   # Or use local installations
   ```

3. **Configure environment:**
   ```bash
   cp packages/backend/.env.example packages/backend/.env
   # Edit .env with your settings
   ```

4. **Setup database:**
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

5. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - Customer PWA: http://localhost:5173
   - Admin Panel: http://localhost:5174
   - Backend API: http://localhost:3000

### Demo Credentials
After seeding:
- **Email:** admin@demo.com
- **Password:** Admin123!
- **Restaurant:** demo-restaurant

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new restaurant |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout |

### Menu (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/menu/categories` | List categories |
| POST | `/api/menu/categories` | Create category |
| GET | `/api/menu/items` | List menu items |
| POST | `/api/menu/items` | Create menu item |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders |
| GET | `/api/orders/active` | Get active orders |
| PATCH | `/api/orders/:id/status` | Update order status |

### Public (Customer)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/r/:slug` | Get restaurant info |
| GET | `/api/public/r/:slug/menu` | Get public menu |
| POST | `/api/public/r/:slug/orders` | Create order |
| GET | `/api/public/orders/:id/status` | Track order |

## Socket.io Events

### Client to Server
- `join:restaurant` - Join restaurant room (admin)
- `join:table` - Join table room (customer)

### Server to Client
- `order:new` - New order received
- `order:statusUpdate` - Order status changed
- `table:update` - Table status changed
- `menu:update` - Menu updated

## Docker Deployment

### Production
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Scale backend
docker-compose up -d --scale backend=3
```

### Development with Docker
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | development |
| `PORT` | Backend port | 3000 |
| `DATABASE_URL` | PostgreSQL connection | - |
| `REDIS_URL` | Redis connection | redis://localhost:6379 |
| `JWT_ACCESS_SECRET` | Access token secret | - |
| `JWT_REFRESH_SECRET` | Refresh token secret | - |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL | 15m |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | 7d |
| `CORS_ORIGIN` | Allowed origins | localhost |

## Scripts

```bash
# Development
npm run dev              # Start all packages
npm run dev:customer     # Start customer PWA only
npm run dev:admin        # Start admin panel only
npm run dev:backend      # Start backend only

# Build
npm run build            # Build all packages

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run migrations
npm run db:seed          # Seed demo data

# Docker
npm run docker:up        # Start containers
npm run docker:down      # Stop containers
npm run docker:logs      # View logs
```

## License

MIT
