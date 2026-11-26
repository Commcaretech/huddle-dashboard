# Data mapping

Map each source alias exactly to one configured centre. Quarantine unknown aliases for review. Retain original external identifiers and version the adapter when changing a metric's definition.

| Concept | Mapping rule |
| --- | --- |
| Registered or active people | Use an approved cross-centre distinct total or a verified cross-centre identifier. Treat an aggregate centre count as centre-specific. |
| Attendance | Count attendance entries separately from unique people. Define repeat participation and the eligibility denominator. |
| Programmes | Separate programme series and dated occurrences. Preserve scheduled, completed and cancelled status independently. |
| Assessments | Keep assessment counts, people assessed, and matched longitudinal cohorts separate. Confirm definitions and score direction with the data owner. |
| Media | Keep reach scoped to each platform unless the source supplies a deduplicated cross-platform measure. Store engagement numerator and denominator. |
| Missing data | A reported zero is numeric zero. A missing or unavailable observation lacks an accepted value. Keep unit and methodology visible. |

For the upcoming Excel/CSV workflow, require preview, duplicate review, selected worksheet, explicit mapping and confirmation. Keep the legacy files as source records. Existing `server/validation.js` and its tests describe the old template rules, which are distinct from the normalised contract.
