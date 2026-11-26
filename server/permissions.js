import { and, eq, inArray, sql } from 'drizzle-orm';
import { centres, grants, users } from './db/schema.js';

export const canManage = role => role === 'hq_admin' || role === 'centre_manager';
export const canWrite = role => canManage(role) || role === 'centre_staff';
export const isHQ = role => role === 'hq_admin' || role === 'hq_viewer';

export async function loadActor(db, subject) {
  const [user] = await db.select().from(users).where(and(eq(users.subject, subject), eq(users.active, true)));
  if (!user) return null;
  const rows = await db.select().from(centres).where(
    isHQ(user.role) ? eq(centres.orgId, user.orgId) : and(eq(centres.orgId, user.orgId), inArray(centres.id,
      db.select({ id:grants.centreId }).from(grants).where(and(eq(grants.userId,user.id),eq(grants.orgId,user.orgId)))))
  ).orderBy(centres.name);
  return { ...user, centres:rows };
}

export function centreScope(actor, table, centreId) {
  const ids = actor.centres.map(centre => centre.id);
  return and(eq(table.orgId, actor.orgId), ids.length ? inArray(table.centreId, centreId ? ids.filter(id => id === centreId) : ids) : sql`false`);
}
