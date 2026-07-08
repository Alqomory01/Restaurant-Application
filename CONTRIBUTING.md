# Contributing

## Branching

- `master` is the shared branch — treat it as always-deployable.
- Work in a feature branch per task: `feature/<short-description>` (e.g. `feature/foodops-purchase-orders`) or `fix/<short-description>`.
- Open a pull request into `master` instead of pushing directly. Get at least one review from the other dev before merging.
- Keep PRs scoped to one module/feature where possible — the codebase is organized as `backend/apps/<module>` and `frontend/src/app/(app)/<screen>`, so most changes should touch one of those at a time.
- Rebase or merge `master` into your branch before opening/updating a PR to keep history clean and catch conflicts early.

## Before pushing

- Backend: `cd backend && ./.venv/Scripts/python manage.py makemigrations --check` (or just make sure `makemigrations` doesn't produce anything unexpected), and confirm `python manage.py test` passes once tests exist.
- Frontend: `cd frontend && npx tsc --noEmit && npm run build` — both should be clean.
- If you changed models, commit the generated migration file(s) alongside the model change in the same PR.

## Local setup

See `README.md` for how to run the full stack (`docker compose up -d --build`) and demo credentials.

## Commit messages

Short, imperative, explain *why* over *what* where it's not obvious from the diff. No need to over-explain a one-line fix.
