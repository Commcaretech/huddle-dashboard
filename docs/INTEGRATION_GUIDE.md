# Integration guide

The Data Sources registry shows planned datasets and their current status. The adapter contract in `server/integrations/contracts.js` defines connection testing, paged read-only reads and per-record transformation. The metrics contract stores timestamps, version and methodology alongside values. ActivityHub supports manual connection tests and sync. Other sources remain onboarding entries. See [ActivityHub setup](DATA_INTEGRATION_GUIDE.md).

| Source | Inspected evidence and next input |
| --- | --- |
| ActivityHub / Program-SpaceBooking | Inspected `supabase/functions/p3h-programmes/service.ts`. Confirm the authorised deployment URL and whether the existing audience and eligibility filters are suitable for management reporting. Provide a dedicated scoped token or approved reuse of the existing feed, schema samples with stable programme and occurrence keys, status and visibility semantics, exact centre codes, and a paging test account. The feed uses `x-p3h-sync-token` and can require restarting a changed snapshot. Resolve whether cancelled and historical occurrences need a separate feed. |
| GLOWBB attendance and health | Inspected `server/app.js` and `server/sppb-routes.js`. Existing `/api/dashboard` and `/api/sppb/overview` are application endpoints. Confirm an authorised aggregate service endpoint or view, date dimensions, programme/centre mapping, denominator and distinct-count rules, and approved disclosure thresholds. |
| P3H Dashboard | Inspected `src/app/api/reports/route.ts` and `src/app/api/programmes/sync/route.ts`. Programme sync consumes an upstream feed. Supply a separate authorised read-only aggregate feed or view and data dictionary for programmes/surveys, centre IDs, permitted columns and pagination. Avoid double-counting ActivityHub data already consumed by P3H. |
| CaritaHub | Provide representative sanitised files, supported worksheets and headers, centre codes, cancellation status rules and update identifiers. |
| Other attendance / health | Provide repository location, scoped credentials and de-identified aggregate samples. Supply stable identities or approved deduplicated aggregates where longitudinal or cross-centre reporting is needed. Verify assessment definitions before scoring. |
| Publicity | Provide repository location, service endpoint and scoped credentials, supported platforms, count definitions, and approved link and thumbnail policy. |
| Out-of-office tracker | Provide repository location, read-only availability endpoint or view, centre assignments, time zones, staffing thresholds and timetable semantics. Exclude leave reasons. |
| Excel/CSV | Provide approved samples, column definitions, date and decimal formats, duplicate keys, amendments policy and centre mapping. |

Build each adapter from a sanitised fixture and contract test. Add explicit exact mapping, idempotent writes, job counts, rollback or retry semantics, cursor handling and a named owner. Keep legacy credentials in the adapter's server environment and maintain source read-only access. Run real connection tests and verify freshness before showing a source as connected.
