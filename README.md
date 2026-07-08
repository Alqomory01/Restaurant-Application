# Mise ERP — Kitchen Module (Phase 1)

Restaurant ERP, starting with the kitchen module: recipes, daily production planning, batch tracking with atomic ingredient deduction, kitchen stock, stock requests, manager-gated recipe costing, and a live kitchen dashboard/KDS.

Stack: **Next.js** (frontend) + **Django REST Framework** (backend) + **PostgreSQL**, wired together with Docker Compose.

## Run it

```bash
cp .env.example .env   # defaults work as-is for local dev
docker compose up -d --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api
- Django admin: http://localhost:8000/admin
- Postgres (host access, e.g. via psql/DBeaver): `localhost:5433` (remapped from 5432 to avoid clashing with a locally installed Postgres)

On first boot the backend container runs migrations and seeds demo data automatically (`seed_kitchen_demo`).

### Demo users

All demo users share the password `MiseDemo123!`:

| Username | Role |
|---|---|
| `head_chef` | Head Chef |
| `kitchen_staff` | Kitchen Staff |
| `manager` | Manager (only role with access to Recipe Costing) |

## Project layout

```
backend/    Django + DRF API (apps/accounts = auth, apps/kitchen = domain logic)
frontend/   Next.js App Router UI
docker-compose.yml
```

## Local (non-Docker) backend dev

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # (or .venv/bin/pip on macOS/Linux)
docker compose up -d db   # just the database
POSTGRES_HOST=localhost POSTGRES_PORT=5433 ./.venv/Scripts/python manage.py migrate
POSTGRES_HOST=localhost POSTGRES_PORT=5433 ./.venv/Scripts/python manage.py seed_kitchen_demo
POSTGRES_HOST=localhost POSTGRES_PORT=5433 ./.venv/Scripts/python manage.py runserver
```

## Local (non-Docker) frontend dev

```bash
cd frontend
npm install
npm run dev
```

## What's implemented (Phase 1)

- JWT auth (access token in memory, refresh token as an httpOnly cookie), role-scoped to `HEAD_CHEF` / `KITCHEN_STAFF` / `MANAGER`.
- Recipes: ingredients, cooking steps, yield/costing fields.
- Daily production plans → auto-generates kitchen stock requests for ingredient shortfalls on submit.
- Kitchen Display System (polling) to start batches from a plan.
- Batch completion is a single atomic transaction: deducts kitchen stock, records theoretical-vs-actual ingredient usage, updates plan item status.
- Kitchen stock levels with reorder-threshold flags.
- Stock requests (create + mark fulfilled).
- Recipe costing — real backend permission check (403 for non-managers), not a cosmetic UI lock.
- Dashboard KPIs, with the food-cost tile gated to managers.

## Deliberately out of scope for this phase

Full multi-branch switching, FoodOps/DineFlow/Management modules, WebSocket real-time sync (KDS uses polling for now), MFA, and the full 8-role permission matrix — see `mise_system_flows.html` for the eventual full-system design these will plug into.
