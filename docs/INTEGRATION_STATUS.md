# Integration status

| Source | Implementation status |
| --- | --- |
| ActivityHub | API v1 adapter and Neon snapshot workflow implemented. Connection test, discovery, exact mapping, preview, bounded sync, conditional requests, reconciliation, history and report sections verified with synthetic fixtures and local PostgreSQL-compatible tests. |
| Attendance | Adapter registration and onboarding requirements. A verified aggregate endpoint and distinct-person methods are needed. |
| Health | Adapter registration and onboarding requirements. An approved aggregate feed and reporting definitions are needed. |
| Publicity | Adapter registration and onboarding requirements. An approved platform feed and metric definitions are needed. |
| P3H | Adapter registration and onboarding requirements. An approved outgoing aggregate feed and deduplication rules are needed. |
| Staff leave tracker | Adapter registration and onboarding requirements. A verified read-only availability feed is needed. |
| CaritaHub, Excel and CSV | Listed for onboarding. Approved file schemas and amendment rules are needed. |

No hosted source was connected during development. Production needs the approved ActivityHub Edge Function deployment, credentials, Neon migration, role grants, exact mappings and a real connection test. Source availability and historical coverage should be verified in the actual environment.

Current storage keeps the latest published version per centre and exact date scope, plus durable job history. It preserves the previous snapshot when a run fails. It does not implement signed-off historical report revisions, a scheduler, official KPI targets or an integration-specific identity provider. Existing manual reports, conclusions and actions are separate from imported data.
