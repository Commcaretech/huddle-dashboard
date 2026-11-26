# GlowBBDashboard data mapping

The source identifier is **`GlowBBDashboard`**, with schema version **`1.0`**. The only accepted external centre is **`glow_bukit_batok`**. Map it to the active Hub centre with code **`GLOW_BB`** or **`GLOW_BUKIT_BATOK`**. Other centre views stay unavailable. Combined HQ reports label the single-centre coverage.

| Hub report | Source datasets and figures |
| --- | --- |
| KPI Performance | `summary`, `trends`, `kpis`, and `health-assessments` provide recorded programmes, delivered sessions with attendance, attendance entries, distinct reach, released assessments, saved targets, and attainment. The Hub requests exact same-date prior-year and aligned YTD comparisons. |
| Participant Profiles | `membership`, `attendance`, `demographics`, `programmes`, and `trends` provide approved registry counts, first observed and returning participants, attendance frequency, matched retention, demographic bands, ranked programmes, domains and exact mapped Event Types. |
| Health Data | `health-assessments` provides separate reported SPPB and Tanita totals and screening activity counts. When enabled upstream, linked SPPB aggregates add coverage, scores, trends, repeat assessments and matched numerical outcomes. |
| Fitness | `fitness` supplies exactly classified Fitness and Gym Tonic programme rows, attendance, reach and trends. The Hub requests Gym Tonic separately when discoverable alongside Fitness. |
| H.ART | `hart` is used when advertised for an exact source-approved H.ART label. Separately approved Hub programme IDs are displayed as individual programme rows without recomputing combined unique participation. |

Metric definitions come from source discovery. A snapshot retains the returned dataset and metric identifiers, centre, exact inclusive period, applied filters, available range, source update timestamp, definition and methodology, and schema version. Metric cells retain unit, status, and released numerator and denominator. Publication time is stored in Neon at scope level. Programme and KPI rows keep their exact saved classifications and target scopes.

Status `missing` is shown as unavailable and `suppressed` remains suppressed. A source-released zero stays zero. Suppressed numerators and denominators are cleared. Individual attendee and assessment records are discarded at the adapter boundary. An optional percentage display uses the sum of released non-overlapping bands, with its denominator described. Overlapping language bands and score distributions remain counts.

The source computes all distinct-person and retention measures. The Hub makes exact inclusive date requests for selected, historic and YTD scopes. It does not add non-additive source metrics across months, programmes, or centres. Historical membership totals require a source snapshot. The current registry cannot reconstruct earlier status.

**Unavailable or conditional:** MMSE, GT, LC, Tanita body composition and matched Tanita outcomes, participant-level records, clinical thresholds, capacity, waitlists, and complete historical membership status. SPPB linked outcomes and Fitness/H.ART classifications depend on source release and verified mapping. Clinical interpretation remains manual. All 13 tabs retain their manual reporting, implications and actions.
