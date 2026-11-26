import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { organisations, centres, periods, settings } from './db/schema.js';
import { centreInput, periodInput, settingsInput, uid } from './validation-hub.js';
import { requireAccess, RequestError, log } from './report-routes.js';

export function adminRoutes(db, config) {
  const router = Router();
  router.get('/workspace', async (req,res) => {
    const {actor} = req;
    const [[org], [preferences], dates] = await Promise.all([
      db.select().from(organisations).where(eq(organisations.id,actor.orgId)),
      db.select().from(settings).where(eq(settings.orgId,actor.orgId)),
      db.select().from(periods).where(eq(periods.orgId,actor.orgId)).orderBy(desc(periods.start),periods.name)
    ]);
    res.json({organisation:org.name, settings:preferences, centres:actor.centres, periods:dates,
      user:{id:actor.id,name:actor.name,role:actor.role}, demo:config.demo});
  });

  router.use('/admin', (req,_res,next) => { requireAccess(req.actor.role === 'hq_admin'); next(); });
  router.post('/admin/centres', async (req,res) => {
    const input = centreInput.parse(req.body);
    const row = await db.transaction(async tx => {
      const [result] = await tx.insert(centres).values({...input,orgId:req.actor.orgId}).returning();
      await log(tx,req.actor,'centre.created',result.id);
      return result;
    });
    res.status(201).json(row);
  });
  router.patch('/admin/centres/:id', async (req,res) => {
    const id = uid.parse(req.params.id);
    const input = centreInput.parse(req.body);
    const row = await db.transaction(async tx => {
      const [result] = await tx.update(centres).set({...input,updatedAt:new Date()})
        .where(and(eq(centres.orgId,req.actor.orgId),eq(centres.id,id))).returning();
      if (!result) throw new RequestError(404,'Centre was not found.');
      await log(tx,req.actor,'centre.updated',id);
      return result;
    });
    res.json(row);
  });
  router.post('/admin/periods', async (req,res) => {
    const input = periodInput.parse(req.body);
    const row = await db.transaction(async tx => {
      const [result] = await tx.insert(periods).values({...input,orgId:req.actor.orgId}).returning();
      await log(tx,req.actor,'period.created',result.id);
      return result;
    });
    res.status(201).json(row);
  });
  router.put('/admin/settings', async (req,res) => {
    const {name,...input} = settingsInput.parse(req.body);
    await db.transaction(async tx => {
      await tx.update(organisations).set({name}).where(eq(organisations.id,req.actor.orgId));
      await tx.insert(settings).values({...input,orgId:req.actor.orgId}).onConflictDoUpdate({
        target:settings.orgId,set:{...input,updatedAt:new Date()}
      });
      await log(tx,req.actor,'settings.updated',req.actor.orgId);
    });
    res.json({saved:true});
  });
  return router;
}
