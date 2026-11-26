import { activityHubAdapter, activityHubConfig } from './activityhub.js';
import { sourceRegistry } from './contracts.js';

const onboarding = {
  attendance:'Approved aggregate attendance endpoint, distinct-person rules, and date and centre schema.',
  caritahub:'Sanitised exports, worksheet schema and stable update identifiers.',
  health:'Aggregate endpoint, approved assessment definitions and disclosure rules.',
  p3h:'Approved aggregate read-only feed, metric definitions and deduplication with ActivityHub.',
  publicity:'Approved platform API and metric definitions.',
  manpower:'Read-only availability summaries and privacy rules for staff leave.',
  excel:'Approved templates and duplicate/amendment rules.',
  csv:'Approved templates, formats and duplicate/amendment rules.'
};
export function integrationAdapters(env=process.env, fetcher=fetch) {
  return new Map(sourceRegistry.map(source=>[source.key,source.key==='activityhub'
    ? activityHubAdapter(activityHubConfig(env),fetcher)
    : {key:source.key,configured:false,onboarding:onboarding[source.key]}]));
}
