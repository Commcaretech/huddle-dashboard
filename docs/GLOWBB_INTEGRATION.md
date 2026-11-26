# GlowBBDashboard integration

GlowBBDashboard supplies approved aggregates for GLOW Bukit Batok through its read-only reporting API. See the [source API guide](reference/glowbb/MANAGEMENT_HUB_API.md), [metric inventory](reference/glowbb/MANAGEMENT_HUB_DATASETS.md), and [OpenAPI contract](reference/glowbb/management-hub-openapi.json).

## Vercel Production environment variables

| Variable | Value |
| --- | --- |
| `GLOWBB_REPORTING_BASE_URL` | `https://glowbbdashboard.vercel.app/api/reporting/v1`, or `https://<glowbb-project-host>/api/reporting/v1` for another deployment |
| `GLOWBB_API_KEY` | The same dedicated secret configured as `MANAGEMENT_HUB_API_KEY` on the GlowBBDashboard **Express runtime** |
| `INTEGRATION_OPERATOR_KEY` | Existing Hub operator key, or a separate random 64-character hexadecimal key |

Set the source runtime's `MANAGEMENT_HUB_CENTRES` to include `glow_bukit_batok`. If GlowBBDashboard's Vercel deployment proxies to another backend, configure the source secret and allowed centres on that backend. Authorise `MANAGEMENT_HUB_SPPB_AGGREGATES=1` on the source only if linked SPPB aggregate release is approved.

The Hub sends **Authorization: Bearer** on backend HTTPS requests. The source API key is absent from frontend bundles, URLs, and returned errors. The integration operator key is entered in a masked field and held in browser memory for authorised requests. Rotate the source and operator credentials separately.

## Neon and deployment

The integration uses existing tables for sources, aliases, dataset catalogues, jobs, issues and snapshots. A Hub with the ActivityHub integration schema already installed can deploy without a new migration. If the integration tables are absent, apply the existing [0001 migration](../migrations/0001_silent_aqueduct.sql) through the controlled migration procedure or run the [browser SQL upgrade](neon-browser-integration-upgrade.sql) in the Neon SQL Editor as the database owner. The browser route requires no laptop Node.js installation.

The Hub excludes ActivityHub from source registration, API actions, Sync all and report reads. Historical ActivityHub snapshots, jobs and mappings stay in Neon. The legacy records are not reassigned to GlowBBDashboard. The former ActivityHub environment variables can be removed from the Hub.

After the source API is deployed and the three Hub variables are configured, deploy the Hub commit on Vercel. Open **Data sources → Unlock integrations → Test connection**. Continue with the [sync guide](GLOWBB_SYNC_GUIDE.md).

## Optional approval settings

- `GLOWBB_APPROVED_METRICS` accepts comma-separated `dataset.metric` keys. Use only after review of the source catalogue, scope, unit, methodology and privacy. New scalar metrics can be added this way. A new distribution shape requires deliberate code review.
- `GLOWBB_APPROVED_HART_PROGRAMMES` accepts comma-separated exact programme IDs obtained from the source, after management approval. It exposes separate programme rows on H.ART. It does not combine those rows into a distinct participant total or override source H.ART classification.
- Official saved KPI targets are configured in GlowBBDashboard. The Hub reads their saved scopes and does not generate targets.

Use approved hosting or network access controls before sharing live operational data. The workspace still uses a shared actor and an operator key for imported reports and source controls. Scope checks limit GlowBBDashboard to the approved mapped centre. There is no per-person attribution while the Hub uses a shared actor.
