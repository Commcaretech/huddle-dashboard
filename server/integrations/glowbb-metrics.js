export const glowCentre = 'glow_bukit_batok';
export const glowSource = 'glowbb';
export const glowTabs = ['kpi-performance','participant-profiles','health-data','fitness','hart'];
export const glowRoutes = ['summary','attendance','trends','programmes','fitness','hart','membership','demographics','health-assessments','kpis'];
const reach=['male','minority','malePct','minorityPct','attendance','allAges','unique','seniorAttendance','firstObserved','returning',
  'sessions','programmes','repeat','multiProgramme','multiDomain','repeatRate','frequency','average'];
export const approvedMetrics={
  summary:reach,attendance:[...reach,'frequencyDistribution','retained','retentionRate'],trends:reach,
  programmes:reach,fitness:reach,hart:reach,
  demographics:['gender','race','ages','clients','boundary','language'],
  membership:['registered','newMembers','active','inactive'],
  'health-assessments':['reportedTotal','screeningPeople','screeningAttendance','eligible','assessed','coverage','records','repeated',
    'scoreDistribution','averageStandardScore','comparable','increased','unchanged','decreased','previousScore','latestScore',
    'baselineScore','baselineLatestScore','baselineMatched'],
  kpis:['actual','target','attainment']
};
export const distributions=new Set(['frequencyDistribution','gender','race','ages','clients','boundary','language','scoreDistribution']);
