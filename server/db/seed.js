import { and, eq } from 'drizzle-orm';
import { organisations, centres, periods, users, settings, entries } from './schema.js';
import { addDays, fortnight, singaporeToday } from '../../shared/reporting.ts';

export const demoSubject = 'local-synthetic-demo';
const demoId = '00000000-0000-4000-8000-000000000001';

export async function seedDemo(db) {
  const dates = fortnight(singaporeToday(), '2026-01-05');
  await db.transaction(async tx => {
    const [org] = await tx.insert(organisations).values({id:demoId,name:'Community Care'}).onConflictDoNothing().returning();
    if (!org) return;
    await tx.insert(settings).values({ orgId:demoId });
    await tx.insert(users).values({orgId:demoId,subject:demoSubject,name:'Demo administrator',role:'hq_admin'});
    const [nanyang, bukitBatok] = await tx.insert(centres).values([
      {orgId:demoId,code:'SEEN_NY',name:'SEEN Nanyang'},
      {orgId:demoId,code:'GLOW_BB',name:'GLOW Bukit Batok'}
    ]).returning();
    const [period] = await tx.insert(periods).values([
      {orgId:demoId,name:'Current fortnight',kind:'Fortnightly',...dates},
      {orgId:demoId,name:'Previous fortnight',kind:'Fortnightly',start:addDays(dates.start,-14),end:addDays(dates.start,-1)}
    ]).returning();
    const common = {orgId:demoId,periodId:period.id,archived:false};
    await tx.insert(entries).values([
      {...common,centreId:nanyang.id,kind:'practice',title:'Welcome calls for first-time participants',category:'Outreach',status:'Good practice',date:dates.start,details:{description:'Test a short welcome call before a first visit.',outcome:'The team captured common questions to include in the welcome script.'}},
      {...common,centreId:nanyang.id,kind:'development',title:'Resident network planning meeting',category:'RN meeting',status:'Completed',date:addDays(dates.start,3),details:{description:'Discuss programme access with community partners.',outcome:'The team agreed to trial a shared signposting guide.',highlight:true}},
      {...common,centreId:bukitBatok.id,kind:'development',title:'Volunteer orientation',category:'Volunteering',status:'Planned',date:addDays(dates.end,6),details:{description:'Introduce new volunteers to the centre and its activities.',highlight:true,priority:'High'}},
      {...common,centreId:nanyang.id,kind:'development',title:'Review outreach pilot',category:'Strategic initiative',status:'In progress',date:addDays(dates.end,16),dueDate:addDays(dates.end,40),details:{description:'Review results and agree the next trial location.',progress:'30'}},
      {...common,centreId:bukitBatok.id,kind:'training',title:'Facilitation refresher',category:'Core training',status:'Scheduled',date:addDays(dates.start,8),details:{description:'Practise adapting activities to varied mobility needs.',owner:'Centre team'}},
      {...common,centreId:nanyang.id,kind:'logistics',title:'Replace activity room chairs',category:'Furniture replacement',status:'Submitted',date:dates.start,dueDate:addDays(dates.end,7),details:{description:'Replace chairs identified during a condition check.',quantity:'4',estimate:'320.00',priority:'Normal'}}
    ]);
  });
}

export async function bootstrap(db, config) {
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(users).where(eq(users.subject, config.subject));
    if (existing) {
      if (existing.role !== 'hq_admin') throw new Error('Subject is already assigned another role.');
      return existing;
    }
    const [org] = await tx.insert(organisations).values({ name:config.organisation }).returning();
    await tx.insert(settings).values({orgId:org.id});
    const [admin] = await tx.insert(users).values({orgId:org.id,subject:config.subject,name:config.name,role:'hq_admin'}).returning();
    return admin;
  });
}
