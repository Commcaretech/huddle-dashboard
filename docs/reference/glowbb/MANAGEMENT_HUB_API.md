# Management Hub reporting API

The reporting API reads the existing centre workspaces behind GlowBBDashboard. It uses the dashboard's official reporting policy and centre-specific definitions. The Management Hub can pull aggregates into Neon using its own server-side job or request handler.

## Base URL and deployment

- Configured production project: `https://glowbbdashboard.vercel.app/api/reporting/v1`
- Other Vercel environments: `https://<glowbb-project-host>/api/reporting/v1`
- Local Express: `http://127.0.0.1:3000/api/reporting/v1` when configured to run on port 3000. Use the port printed at startup.

Deploy this checkout to the existing GlowBBDashboard project. Keep its existing `DATABASE_URL` and `APP_ORIGIN` for hosted PostgreSQL. An existing proxy deployment keeps `DASHBOARD_BACKEND_URL` in Vercel and configures the reporting secret and centre scope on the Express backend. The API requires the existing dashboard schema and saved centre data. This change adds no migration. For a new database, follow [Hosting](HOSTING.md) and the existing migration instructions, including [shared SPPB setup](SPPB-ASSESSMENTS.md) when using that source.

| Where | Variable | Value |
| --- | --- | --- |
| GlowBBDashboard Express runtime | `MANAGEMENT_HUB_API_KEY` | Generate a random secret of 32 or more characters, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. |
| GlowBBDashboard Express runtime | `MANAGEMENT_HUB_CENTRES` | Comma-separated approved centre IDs. Example `glow_bukit_batok`. |
| GlowBBDashboard Express runtime, optional | `MANAGEMENT_HUB_SPPB_AGGREGATES` | Defaults to off. Set to `1` after approving the release of linked SPPB coverage, scores and longitudinal aggregates. |
| Management Hub Vercel runtime | `MANAGEMENT_HUB_API_KEY` | Use the same secret. |
| Management Hub Vercel runtime | `GLOWBB_REPORTING_BASE_URL` | Suggested consumer-side variable. Set it to the production base URL above. The consumer code reads this variable. |

Supported centre IDs are `glow_bukit_batok`, `seen_bukit_batok`, `glow_nanyang` and `seen_nanyang`. Use `centre` on each request when more than one is allowed. Use separate secrets for separate deployment environments and rotate both ends together. Store these variables as server-side secrets. The browser and Neon do not need the GlowBBDashboard database credentials or token.

After deployment, call `health` and check `workspaceAvailable`, then call `datasets` for every approved centre. Reconcile a known period against the same dashboard view and filters before persisting the first import.

## Authentication and requests

All routes require `Authorization: Bearer <secret>`. Use GET or HEAD. Missing or invalid credentials return 401 with a Bearer challenge. A valid token outside its configured centre scope returns 403. Unsupported filters return 400. An absent explicit classification or unknown route returns 404. Writes return 405. Retry 429 and transient 5xx with backoff. A 503 can indicate missing server configuration.

PowerShell examples with the secret already in the process environment

```powershell
$headers = @{ Authorization = "Bearer $env:MANAGEMENT_HUB_API_KEY" }
$base = 'https://glowbbdashboard.vercel.app/api/reporting/v1'
Invoke-RestMethod "$base/health?centre=glow_bukit_batok" -Headers $headers
Invoke-RestMethod "$base/datasets?centre=glow_bukit_batok" -Headers $headers
Invoke-RestMethod "$base/trends?centre=glow_bukit_batok&year=2026&grain=quarter" -Headers $headers
Invoke-RestMethod "$base/health-assessments?centre=glow_bukit_batok&year=2026&assessmentType=TANITA" -Headers $headers
```

## Routes and filters

| GET route | Returns | Optional filters beyond centre |
| --- | --- | --- |
| `/health` | Readiness and existing workspace flag | |
| `/datasets` | Metric catalogue, data availability and supported filters | |
| `/summary` | Reach, attendance, sessions, programmes and equivalent-period figures | Period, programme, domain, subdomain |
| `/attendance` | Summary metrics, frequency bands and matched period retention | Period, programme, domain, subdomain |
| `/trends` | Monthly, quarterly or yearly attendance and reach | Period, programme, domain, subdomain, grain |
| `/programmes` | Ranked programmes, mapped classifications, period and monthly figures | Period, programme, domain, subdomain, page, limit |
| `/fitness` | Programme figures for an explicitly recorded Fitness or Gym Tonic label | Period, programme, domain, subdomain, page, limit |
| `/hart` | Programme figures for an explicitly recorded H.ART label | Period, programme, domain, subdomain, page, limit |
| `/membership` | Registered headcount, recorded registrations and client recency | Period |
| `/demographics` | Senior attendee age, gender, race, client status, boundary status and language distributions | Period, programme, domain, subdomain |
| `/health-assessments` | Recorded SPPB/Tanita totals and screening counts. Optional linked SPPB metrics. | Period, assessmentType |
| `/kpis` | Existing attendance dashboard and Operations targets, attainment and historical actuals | Period |

- Period means `from=YYYY-MM-DD&to=YYYY-MM-DD`, or `year=YYYY` with optional `month=1..12` or `quarter=1..4`. Both endpoints of a period are inclusive in Asia/Singapore. By default the API reports from 1 January through today. Current calendar periods end today. Explicit future dates and ranges longer than ten years are rejected.
- `previous` is the immediately preceding period with the same number of calendar days. Its start must be within observed attendance coverage. KPI rows retain their saved target scope even when it overlaps only part of the selected report period. Use `/trends` for calendar comparisons or call the same dates in a prior year. Annual and quarterly distinct counts are evaluated directly from the period's records.
- `programme` is the programme identifier from `/programmes`. `domain` is one of Physical, Cognitive, Learning, Social or Volunteerism. `subdomain` is the exact mapped Activity Name/Event Type string. `Unclassified / unknown` selects sessions without a mapped Event Type.
- `grain` defaults to `month` and supports `quarter` and `year`. `page` defaults to 1 and `limit` to 50, with up to 100 programme rows per page. Rank and pagination apply to releasable rows. `assessmentType` accepts `SPPB` and `TANITA`.
- `/fitness` uses `Fitness` when it is present and otherwise uses `Gym Tonic` when present. To get Gym Tonic separately, request `subdomain=Gym%20Tonic` if listed in the catalogue. `/hart` requires the exact `H.ART` label. Classification can use the reviewed label produced by the existing event type mapping. Source coverage and labels can vary by centre.

## Response and missing data

Each reporting response identifies the source system, centre, dataset, schema version, reporting period, applied filters and retrieval timestamp. The available date range is based on observed sources. Where present, the last-updated timestamp is the most recent recorded source import or relevant edit the endpoint can observe. Legacy data may have no timestamp. A date bound does not certify continuous or complete coverage.

The excerpt below shows the shape of an attendance metric. Ratio metrics include their approved numerator and denominator when available.

```json
{
  "sourceSystem": "GlowBBDashboard",
  "centreId": "glow_bukit_batok",
  "centreName": "GLOW Bukit Batok",
  "dataset": "summary",
  "schemaVersion": "1.0",
  "timezone": "Asia/Singapore",
  "period": { "from": "2026-01-01", "to": "2026-01-31" },
  "appliedFilters": { "centre": "glow_bukit_batok", "year": "2026", "month": "1" },
  "availableDateRange": { "from": "2025-11-01", "to": "2026-01-31" },
  "coverageStatus": "within_observed_range",
  "dataLastUpdatedAt": "2026-02-01T02:00:00Z",
  "dataRetrievedAt": "2026-02-02T02:00:00Z",
  "metrics": {
    "attendance": { "value": 148, "unit": "entries", "status": "available" },
    "repeatRate": {
      "value": 40,
      "unit": "percent",
      "status": "available",
      "numerator": 24,
      "denominator": 60
    }
  }
}
```

Preserve nulls and the statuses `missing` and `suppressed` when importing. Zero with status `available` is a recorded or observed zero. An uninitialized centre workspace gives a 200 with top-level status `missing`; the data-bearing fields are absent. An empty `rows` array can indicate no publishable records. Health monthly totals show limited coverage through `reportedMonths` and `selectedMonths`. A health period total sums available reporting months only.

Access releases aggregate data for the explicitly configured centres. Responses apply the centre privacy minimum with a floor of five, withhold small complements for supported partitions, and redact small cohorts from programme rankings and assessment outputs. Individual records, staff notes and identifiers are excluded. Exact reporting aggregates across overlapping queries can still enable differencing. Keep this token with the approved server consumer and apply your organization's sharing policy to any downstream export or wider distribution.

## Files to transfer

Copy this guide, [the metric inventory](MANAGEMENT_HUB_DATASETS.md), and [the OpenAPI contract](management-hub-openapi.json) into the Management Hub repository. Keep GlowBBDashboard as the calculation source and use the live `/datasets` response to discover centre availability.

