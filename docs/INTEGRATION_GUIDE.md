# Integration guide

The active integration is GlowBBDashboard. See [setup and deployment](GLOWBB_INTEGRATION.md), [metric mapping](GLOWBB_DATA_MAPPING.md) and [manual sync](GLOWBB_SYNC_GUIDE.md). Future sources require an approved contract.

| Source | Inspected evidence and next input |
| --- | --- |
| ActivityHub / Program-SpaceBooking | Retired. Historical published data stays in Neon. |
| GlowBBDashboard | Approved aggregate reporting API v1. Supports discovery and exact period synchronisation. |
| P3H Dashboard | Inspected `src/app/api/reports/route.ts` and `src/app/api/programmes/sync/route.ts`. Programme sync consumes an upstream feed. Supply a separate authorised read-only aggregate feed or view and data dictionary for programmes/surveys, centre IDs, permitted columns and pagination. Avoid double-counting ActivityHub data already consumed by P3H. |
| CaritaHub | Provide representative sanitised files, supported worksheets and headers, centre codes, cancellation status rules and update identifiers. |
| Other attendance / health | Provide repository location, scoped credentials and de-identified aggregate samples. Supply stable identities or approved deduplicated aggregates where longitudinal or cross-centre reporting is needed. Verify assessment definitions before scoring. |
| Publicity | Provide repository location, service endpoint and scoped credentials, supported platforms, count definitions, and approved link and thumbnail policy. |
| Out-of-office tracker | Provide repository location, read-only availability endpoint or view, centre assignments, time zones, staffing thresholds and timetable semantics. Exclude leave reasons. |
| Excel/CSV | Provide approved samples, column definitions, date and decimal formats, duplicate keys, amendments policy and centre mapping. |

Build each adapter from a sanitised fixture and contract test. Add explicit exact mapping, idempotent writes, job counts, rollback or retry semantics, cursor handling and a named owner. Keep legacy credentials in the adapter's server environment and maintain source read-only access. Run real connection tests and verify freshness before showing a source as connected.
