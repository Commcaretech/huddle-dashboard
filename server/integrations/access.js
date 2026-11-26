import { createHash, timingSafeEqual } from 'node:crypto';
import { RequestError } from '../report-routes.js';

const digest = value => createHash('sha256').update(value).digest();
export function requireIntegrationAccess(req, env) {
  const key=env.INTEGRATION_OPERATOR_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new RequestError(403,'Integration access has not been configured.');
  const supplied=req.get('x-integration-operator-key');
  if (!supplied || supplied.length!==64 || !timingSafeEqual(digest(supplied),digest(key))) {
    throw new RequestError(403,'Enter the integration operator key in Data sources.');
  }
}
