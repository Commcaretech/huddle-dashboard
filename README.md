# Community Care Management Hub

Internal management reporting across community care centres in Singapore. This release implements the foundation and manual reporting workflows specified for the first development pass.

## Run locally

Install Node.js 24 LTS. In PowerShell, run:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Demo mode is loopback-only, uses an isolated local PostgreSQL-compatible PGlite database, and comes with labelled synthetic records. Production uses Neon PostgreSQL with shared workspace access.

## What is available

- Exactly 13 primary reporting routes, combined and individual centre views, financial year filtering, light and dark themes, and full-screen meeting presentation.
- Managed centre, period and branding settings in a shared workspace.
- Manual create, edit, archive and restore for practices and challenges, developments, training and logistics. Developments share one record across recent, upcoming and roadmap views.
- Conclusions on each tab, with validated action fields, a global action tracker, status history and unresolved actions carried across reporting periods.
- Read-only Data Sources registry, normalised metric contract and initial integration persistence. Analytical tabs surface unavailable states until approved data flows exist.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | React workspace, reporting forms, actions, administration and styles |
| `shared/` | Tab and field definitions plus Singapore reporting date utilities |
| `server/` | Express routes, workspace scoping and validation |
| `server/db/` | Drizzle schema, runtime connections, migrations runner and explicit bootstrap |
| `server/integrations/` | Source registry and versioned data contract |
| `migrations/` | Versioned PostgreSQL DDL and Drizzle metadata |
| `tests/` | Vitest API and database checks plus Playwright browser journeys |
| `docs/` | Set-up, policy, integration and handover references |

## Checks

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

See [Getting started](docs/GETTING_STARTED.md), [Neon setup](docs/NEON_SETUP.md), [Vercel deployment](docs/DEPLOYMENT.md), [User guide](docs/USER_GUIDE.md), [Handover](docs/HANDOVER.md) and [Development progress](docs/DEVELOPMENT_PROGRESS.md).
