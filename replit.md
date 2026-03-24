# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Full-stack **Public Sector Procurement Monitor** — a sales intelligence tool for tracking government procurement opportunities matching a watchlist of previously lost deals. Integrates with SAM.gov (active solicitations) and USASpending.gov (awarded contract history + real rebid date prediction).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Frontend**: React + Vite + TailwindCSS v4 + shadcn/ui
- **Charts**: Recharts
- **Forms**: react-hook-form + zod

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── procurement-monitor/ # React + Vite frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # Database seeder (21 watchlist entries + config)
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Application Features

### Frontend Pages (React + Vite at `/`)
1. **Dashboard** (`/`) — Summary stats (total alerts, high-priority, unique agencies, TCV), filterable alerts table with priority badges
2. **Watchlist** (`/watchlist`) — 21 pre-seeded lost deal entries with rebid window status (UPCOMING/ACTIVE/CLOSED), add/edit/delete via modal
3. **Run Scan** (`/scan`) — Manual SAM.gov scan trigger with live polling progress log
4. **Settings** (`/settings`) — SAM.gov API key status, keywords, NAICS codes, match threshold, schedule, email config
5. **Analytics** (`/analytics`) — Charts: alerts over time, by priority, top agencies, rebid window Gantt timeline

### Backend API Routes (Express at `/api`)
- `GET/POST /api/watchlist` — List/create watchlist entries
- `GET/PUT/DELETE /api/watchlist/:id` — Get/update/delete watchlist entry
- `GET /api/alerts` — List alerts with filters (priority, agency, date range, min score)
- `GET /api/alerts/stats` — Summary stats (total, high-priority, unique agencies, TCV)
- `DELETE /api/alerts/:id` — Delete an alert
- `POST /api/scan` — Trigger SAM.gov scan (runs in background)
- `GET /api/scan` — List scan history
- `GET /api/scan/:id` — Get scan log (for polling progress)
- `GET/PUT /api/config` — Get/update app configuration
- `GET /api/analytics/alerts-over-time` — Alerts grouped by date
- `GET /api/analytics/alerts-by-priority` — Alerts grouped by priority
- `GET /api/analytics/top-agencies` — Top agencies by alert count
- `GET /api/analytics/rebid-timeline` — Watchlist rebid windows for Gantt chart

### Database Tables (PostgreSQL via Drizzle)
- `watchlist_entries` — Lost deals to monitor (21 pre-seeded)
- `alerts` — Matched SAM.gov opportunities
- `scan_logs` — History of scan runs with progress logs
- `config` — Key-value app configuration

### SAM.gov Integration
- API v2 endpoint: `https://api.sam.gov/opportunities/v2/search`
- Two search strategies: keyword search (per keyword in `title` param) + NAICS-only search
- Deduplication by `noticeId`
- Rate limiting (429 → wait 60s and retry)
- Pagination (1000 results per page)
- Match scoring: word overlap + 0.2 bonus for global keyword match

## Environment Variables
- `SAM_API_KEY` — SAM.gov API key (pre-configured: `SAM-29db880b-64f6-496f-85c9-929bbc01401f`)
- `DATABASE_URL` — PostgreSQL connection string (Replit managed)

## Re-seeding
```bash
pnpm --filter @workspace/scripts run seed
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate React Query hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push schema changes to PostgreSQL
