import type { TrustedIdentity } from '../../../packages/contracts/src';
import type { SiteConfigService } from '../../../packages/backend/src/services/site-config-service';
import { GetPublicSiteConfigHandler, GetSiteConfigHandler, validatePublicPayload, validateSiteConfigPayload } from './handlers/site-config-handlers';
import { catalogActions, type CatalogServices } from './catalog-registry';

export interface RegisteredAction {
  validate(payload: unknown): unknown;
  run(payload: unknown, resolveIdentity: () => Promise<TrustedIdentity>): Promise<unknown>;
}

/** Register only implemented capabilities; later business modules extend this explicitly. */
export function createActionRegistry(service: SiteConfigService, catalog?: CatalogServices): ReadonlyMap<string, RegisteredAction> {
  const publicHandler = new GetPublicSiteConfigHandler(service);
  const adminHandler = new GetSiteConfigHandler(service);
  return new Map<string, RegisteredAction>([
    ['getPublicSiteConfig', { validate: validatePublicPayload, async run() { return publicHandler.handle(); } }],
    ['getSiteConfig', { validate: validateSiteConfigPayload, async run(payload, identity) { return adminHandler.handle(validateSiteConfigPayload(payload), await identity()); } }],
    ...(catalog ? catalogActions(catalog) : []),
  ]);
}
