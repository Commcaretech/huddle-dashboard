export const tabs = /** @type {const} */ ([
  { id: 'kpi-performance', name: 'KPI Performance', group: 'Performance', description: 'Track targets, attainment and period comparisons across centres.', indicators: ['Annual target', 'Current attainment', 'Previous period', 'Year-on-year change'] },
  { id: 'good-practices', name: 'Good Practices and Challenges', group: 'Performance', description: 'Capture what worked, where teams encountered difficulties and what other centres can learn.', indicators: [], module: 'practice' },
  { id: 'recent-developments', name: 'Recent Developments', group: 'Performance', description: 'Review milestones, findings and outcomes for the selected dates.', indicators: [], module: 'development' },
  { id: 'participant-profiles', name: 'Participant Profiles', group: 'Performance', description: 'Understand who participates, how often they return and which programmes they attend.', indicators: ['Registered members', 'Unique active participants', 'Attendance entries', 'Repeat participation'] },
  { id: 'health-data', name: 'Health Data', group: 'Performance', description: 'Review aggregate assessment coverage and outcomes. Assessment definitions require confirmation.', indicators: ['SPPB', 'MMSE', 'GT', 'LC'] },
  { id: 'fitness', name: 'Fitness', group: 'Programmes', description: 'Review fitness delivery, participation and operational barriers.', indicators: ['Sessions conducted', 'Unique participants', 'Gym Tonic participation', 'Equipment availability'] },
  { id: 'hart', name: 'H.ART', group: 'Programmes', description: 'Review programme delivery, feedback and collaborations. Outcome indicators are pending confirmation.', indicators: ['Programmes conducted', 'Sessions conducted', 'Unique participants', 'Attendance entries'] },
  { id: 'media', name: 'Media', group: 'Programmes', description: 'Review publicity activity and compare engagement by platform.', indicators: ['Total posts', 'Platform reach', 'Interactions', 'Follower growth'] },
  { id: 'manpower', name: 'Manpower', group: 'Operations', description: 'Review staffing, availability and volunteer support across centres.', indicators: ['Staffing and turnover', 'Staff leave', 'Volunteer recruitment', 'Volunteer recognition'] },
  { id: 'training', name: 'Training', group: 'Operations', description: 'Track course schedules, completion, costs and learning outcomes.', indicators: [], module: 'training' },
  { id: 'logistics', name: 'Logistics', group: 'Operations', description: 'Follow requests from submission to approval, procurement and completion.', indicators: [], module: 'logistics' },
  { id: 'next-two-weeks', name: 'Next Two Weeks', group: 'Planning', description: 'Prepare for management highlights and deadlines in the next fourteen days.', indicators: [], module: 'development' },
  { id: 'next-three-months', name: 'Next Three Months', group: 'Planning', description: 'Track initiatives, dependencies and milestones across the next three months.', indicators: [], module: 'development' }
]);
/** @typedef {(typeof tabs)[number]} Tab */
export const priorities = /** @type {const} */ (['Low', 'Normal', 'High', 'Urgent']);
export const actionStatuses = /** @type {const} */ (['Pending', 'In progress', 'Blocked', 'Completed']);
export const periodKinds = /** @type {const} */ (['Fortnightly', 'Monthly', 'Quarterly', 'Annual', 'Financial year', 'Custom', 'Year to date']);
/** @typedef {{key:string, label:string, required?:boolean, type?:'money'|'percent'|'quantity'|'url'|'date'}} Field */
/** @typedef {{item:string, date:string, due:string, categories:readonly string[], statuses:readonly string[], fields:Field[]}} Module */
/** @type {Record<string, Module>} */
export const modules = {
  practice: {
    item: 'practice or challenge', date: 'Observation date', due: 'Follow-up date', categories: ['Outreach', 'HSAR', 'Other'], statuses: ['Good practice', 'Challenge'],
    fields: [{key:'description', label:'Description', required:true}, {key:'evidence', label:'Supporting evidence'}, {key:'outcome', label:'Outcomes'}, {key:'lessons', label:'Lessons learnt'}, {key:'implications', label:'Implications'}, {key:'recommendation', label:'Recommended actions'}, {key:'owner', label:'Responsible person'}, {key:'document', label:'Approved attachment link', type:'url'}]
  },
  development: {
    item: 'development', date: 'Start or event date', due: 'Target completion date', categories: ['Research outcomes', 'RN meeting', 'Partner meeting', 'Programme', 'Participant feedback', 'Operations', 'Community engagement', 'Training', 'Deadline', 'Procurement', 'Volunteering', 'Staffing', 'Strategic initiative', 'Other'], statuses: ['Planned', 'In progress', 'Completed'],
    fields: [{key:'description', label:'Description', required:true}, {key:'evidence', label:'Supporting evidence'}, {key:'outcome', label:'Outcome or key findings'}, {key:'completedOn', label:'Outcome recorded date', type:'date'}, {key:'implications', label:'Implications for programming'}, {key:'recommendation', label:'Follow-up or preparation'}, {key:'expected', label:'Expected outcomes'}, {key:'milestones', label:'Milestones'}, {key:'dependencies', label:'Dependencies'}, {key:'risks', label:'Risks'}, {key:'owner', label:'Responsible person'}, {key:'progress', label:'Progress (%)', type:'percent'}]
  },
  training: {
    item: 'training record', date: 'Training date', due: 'Deadline or certification expiry', categories: ['CCP', 'Core training', 'Certification', 'Training need', 'Other'], statuses: ['Proposed', 'Scheduled', 'Ongoing', 'Completed', 'Cancelled'],
    fields: [{key:'description', label:'Training objective', required:true}, {key:'owner', label:'Staff or team'}, {key:'cost', label:'Cost (SGD)', type:'money'}, {key:'outcome', label:'Learning outcomes'}, {key:'application', label:'Post-training application'}, {key:'progress', label:'Progress (%)', type:'percent'}]
  },
  logistics: {
    item: 'logistics request', date: 'Request date', due: 'Expected completion', categories: ['Furniture replacement', 'Laptop procurement', 'Equipment procurement', 'Equipment servicing', 'Repairs', 'Maintenance', 'Other'], statuses: ['Submitted', 'Approved', 'Rejected', 'In procurement', 'Completed'],
    fields: [{key:'description', label:'Reason', required:true}, {key:'quantity', label:'Quantity', type:'quantity', required:true}, {key:'estimate', label:'Estimated cost (SGD)', type:'money'}, {key:'actual', label:'Actual cost (SGD)', type:'money'}, {key:'owner', label:'Responsible staff'}, {key:'document', label:'Approved document link', type:'url'}]
  }
};

export function singaporeToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Singapore', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
}
/** @param {string} date @param {number} days */
export function addDays(date, days) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
/** @param {string} date @param {number} months */
export function addMonths(date, months) {
  const value = new Date(date + 'T00:00:00Z');
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return value.toISOString().slice(0, 10);
}
/** @param {string} date @param {number} startMonth */
export function fiscalYear(date, startMonth) {
  return Number(date.slice(0, 4)) - Number(Number(date.slice(5, 7)) < startMonth);
}
/** @param {string} tab @param {{start:string, end:string}} period */
export function dateWindow(tab, period) {
  const next = addDays(period.end, 1);
  if (tab === 'next-two-weeks') return { start: next, end: addDays(next, 13) };
  if (tab === 'next-three-months') return { start: next, end: addDays(addMonths(next, 3), -1) };
  return { start:period.start, end:period.end };
}
/** @param {string} date @param {string} anchor */
export function fortnight(date, anchor) {
  const difference = (Date.parse(date) - Date.parse(anchor)) / 86400000;
  const start = addDays(anchor, Math.floor(difference / 14) * 14);
  return { start, end: addDays(start, 13) };
}
