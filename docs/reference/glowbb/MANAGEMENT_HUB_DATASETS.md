# Management Hub dataset inventory

Call `/datasets?centre=<centre-id>` for source availability, date ranges, supported filters, units and definitions in the selected workspace. Published counts depend on the observed reporting period and the centre privacy minimum. Do not sum unique counts across months, programmes or overlapping classifications.

## Attendance, trends and programme performance

The table applies to `summary`, `attendance`, `trends`, `programmes`, `fitness`, `hart`. Summary and trends use the official attendance reporting scope. Programme detail also follows the dashboard's performance exclusions. Programme rows include the source domain, combined domains, mapped Event Types, rank among published programmes, current and previous figures for the same programme, and monthly performance.

| Metric | Name | Unit | Method |
| --- | --- | --- | --- |
| `male` | Male senior attendees | people | Unique senior attendees with recorded male gender. |
| `minority` | Senior attendees in configured minority groups | people | Unique senior attendees in the centre's configured minority race groups. |
| `malePct` | Male share of known gender | percent | Male senior attendees divided by senior attendees with known gender, times 100. |
| `minorityPct` | Minority share of known race | percent | Senior attendees in configured minority groups divided by senior attendees with known race, times 100. |
| `attendance` | Attendance entries | entries | Count attendance rows across all ages. |
| `allAges` | Unique attendees, all ages | people | Distinct attendee IDs across the entire slice. |
| `unique` | Unique senior attendees | people | Distinct attendee IDs meeting the configured senior age threshold. |
| `seniorAttendance` | Senior attendance entries | entries | Count attendance rows for attendees meeting the configured senior age threshold. |
| `firstObserved` | First observed senior attendees | people | Senior attendees whose first eligible recorded attendance is within the slice. |
| `returning` | Returning senior attendees | people | Senior attendees first observed before the slice. |
| `sessions` | Recorded sessions | sessions | Distinct delivered session IDs with attendance. |
| `programmes` | Recorded programmes | programmes | Distinct programme IDs with attendance. |
| `repeat` | Repeat senior attendees | people | Senior attendees with at least two distinct sessions in the slice. |
| `multiProgramme` | Multi-programme senior attendees | people | Senior attendees with attendance in more than one programme. |
| `multiDomain` | Multi-domain senior attendees | people | Senior attendees with attendance across more than one combined domain. |
| `repeatRate` | Senior repeat attendance rate | percent | Repeat senior attendees divided by unique senior attendees, times 100. |
| `frequency` | Senior attendance frequency | entries/person | Senior attendance entries divided by unique senior attendees. |
| `average` | Average attendance per session | entries/session | All-age attendance entries divided by distinct sessions. |

### Attendance-only metrics

| Metric | Name | Unit | Method |
| --- | --- | --- | --- |
| `frequencyDistribution` | Attendance frequency bands | people | Unique senior attendees grouped into the dashboard distinct-session bands. |
| `retained` | Returning from the previous equivalent period | people | Distinct senior attendees observed in both the current and previous equivalent period, with identical filters. |
| `retentionRate` | Previous-period attendee retention | percent | Senior attendees in both periods divided by senior attendees in the previous period, times 100. |

## Demographics

Current recorded attendee attributes are used, including when filtering an earlier attendance period. `language` can be missing even when other demographic fields are available.

| Metric | Name | Unit | Method |
| --- | --- | --- | --- |
| `gender` | Gender distribution | people | Unique senior attendees by recorded gender. |
| `race` | Race distribution | people | Unique senior attendees by recorded race, including missing and unknown. |
| `ages` | Age distribution | people | Unique senior attendees using dashboard-configured age bands. |
| `clients` | Client status distribution | people | Unique senior attendees by recorded client status. |
| `boundary` | Boundary distribution | people | Unique senior attendees by recorded centre-boundary status. |
| `language` | Preferred language distribution | people | Latest recorded preferred language of unique senior attendees. Multiple recorded languages overlap. |

## Membership

The application keeps the current registry, including staff-reviewed membership updates. The registry snapshot date bounds its historical applicability. When selecting an earlier period, registration counts describe records retained in the current verified registry. A total for an earlier as-of date cannot be reconstructed from later membership status alone.

| Metric | Name | Unit | Method |
| --- | --- | --- | --- |
| `registered` | Registered clients | people | Current verified client registry excluding archived members. A complete snapshot is required for the centre total. |
| `newMembers` | New registrations | people | Current registry members with a recorded registration day in the period. Requires a complete registry and known registration dates. |
| `active` | Active registered clients | people | Current registry members with active status under the Clients workspace recency rules. |
| `inactive` | Inactive registered clients | people | Current registry members with an inactive status under the Clients workspace recency rules. |

## Health assessments

SPPB and Tanita have separately reported Operations totals and attendance-derived screening counts. Reported totals can cover the same activity as screening counts, so do not add them. Screening attendance establishes attendance at the recorded activity. Linked individual SPPB is a third source used only to calculate approved aggregates server-side. It is opt-in and is scoped to currently registered clients. Its trend counts dated non-superseded linked records by month. Score comparisons describe numerical changes on approved matching standard scoring versions. No clinically meaningful change threshold is recorded.

| Metric | Name | Unit | Method |
| --- | --- | --- | --- |
| `reportedTotal` | Reported monthly assessment total | assessments | Sum available monthly totals using the Operations latest-revision and whole-month selection rules. |
| `screeningPeople` | Screening activity participants | people | Distinct attendees of the exact screening activities recognised by Operations. |
| `screeningAttendance` | Screening activity attendance | entries | Attendance entries for the exact recognised screening activities. |
| `eligible` | Eligible SPPB clients | people | Current verified registered clients in the centre. |
| `assessed` | Clients assessed | people | Eligible clients with a linked dated assessment in the filtered cohort. |
| `coverage` | SPPB assessment coverage | percent | Assessed clients divided by eligible clients, times 100. Requires a verified complete registry. |
| `records` | Dated linked records | assessments | Count dated non-superseded linked records within the selected period. |
| `repeated` | Repeated SPPB assessments | people | Selected clients with assessments on two or more distinct dates through the reporting end. |
| `scoreDistribution` | Latest recorded SPPB totals | people | Count latest unambiguous recorded totals by score and source definition. |
| `averageStandardScore` | Average latest standard SPPB total | points | Average of latest unambiguous validated standard totals. |
| `comparable` | Matched SPPB assessments | people | Participants with a latest and previous unambiguous comparable standard score. |
| `increased` | Score increased | people | Matched participants whose latest validated standard score is higher. |
| `unchanged` | Score unchanged | people | Matched participants whose latest validated standard score is equal. |
| `decreased` | Score decreased | people | Matched participants whose latest validated standard score is lower. |
| `previousScore` | Mean previous matched score | points | Average of previous same-version standard scores for matched participants. |
| `latestScore` | Mean latest matched score | points | Average of latest same-version standard scores for matched participants. |
| `baselineScore` | Mean baseline SPPB score | points | Mean earliest unambiguous same-version validated total for baseline-matched participants. |
| `baselineLatestScore` | Mean latest SPPB score for baseline cohort | points | Mean latest validated total for the same participants as baselineScore. |
| `baselineMatched` | Baseline-matched SPPB participants | people | People with an unambiguous earlier baseline and latest standard score under the same scoring version. |

## KPI targets

Dashboard metric keys are `unique`, `male`, `minority` and `firstObserved`. Operations metric keys are `unique`, `male`, `ib`, `ob`, `firstObserved`, `sppb` and `tanita`. Operations counts use the population shown in Operations, which differs from the senior attendance dashboard. Targets and actuals use their saved period and programme scope.

| Metric | Name | Unit | Method |
| --- | --- | --- | --- |
| `actual` | KPI actual | people or assessments | Recalculate the stored KPI scope using the dashboard or Operations definition. |
| `target` | Stored KPI target | people or assessments | Configured target value. |
| `attainment` | KPI attainment | percent | Actual divided by stored target, times 100. |

## Source limits

- The implementation contains no verified structured MMSE, GT, LC or other individual assessment instrument store. The Tanita source supports reported totals and activity attendance. Body composition measures, matched Tanita outcomes and Tanita assessment coverage are unavailable.
- Fitness, Gym Tonic and H.ART depend on exact reviewed Event Type labels. A general Physical classification or a similarly named programme does not establish one of those categories.
- Attendance files establish observed delivery and participation. Verified capacity, waitlists, cancellations, full membership history, costs and clinical outcome thresholds are unavailable.
- Member data, individual assessments, health risk groups, identifying geography, contact notes, case management and staff records are excluded from the API. Browser-only preferences and presentation layouts do not supply reporting data.
- No official target is inferred from attendance, missing source periods, or historical achievement. Manual reporting configuration and stored targets determine scope and definitions.
