import type { TrustedIdentity } from '../../../packages/contracts/src/index';
import type { SiteConfigService } from '../../../packages/backend/src/services/site-config-service';
import { GetPublicSiteConfigHandler, GetSiteConfigHandler, GetShippingRegionsHandler, UpdateSiteConfigHandler, validatePublicPayload, validateSiteConfigPayload } from './handlers/site-config-handlers';
import { validateUpdateSiteConfigPayload } from '../../../packages/backend/src/services/site-config-service';
import { catalogActions, type CatalogServices } from './catalog-registry';
import { createPointsActions, type PointsServices } from './points-registry';
import { createBuyerActions, type BuyerServices } from './buyer-registry';
import { createTransactionActions, type TransactionServices } from './transaction-registry';
import type { PaymentReconciliationService } from '../../../packages/backend/src/services/payment-reconciliation-service';
import { createReconciliationActions } from './reconciliation-registry';
import type { AdminAuditService } from '../../../packages/backend/src/services/admin-audit-service';
import { createAdminAuditActions } from './admin-audit-registry';

export interface RegisteredAction {
  validate(payload: unknown): unknown;
  run(payload: unknown, resolveIdentity: () => Promise<TrustedIdentity>): Promise<unknown>;
}

/** Register only implemented capabilities; later business modules extend this explicitly. */
export function createActionRegistry(service: SiteConfigService, catalog?: CatalogServices, points?: PointsServices, buyer?: BuyerServices, transactions?: TransactionServices, reconciliation?: PaymentReconciliationService, adminAudit?: AdminAuditService): ReadonlyMap<string, RegisteredAction> {
  const publicHandler = new GetPublicSiteConfigHandler(service);
  const adminHandler = new GetSiteConfigHandler(service);
  const shippingHandler = new GetShippingRegionsHandler(service);
  const updateHandler = new UpdateSiteConfigHandler(service);
  return new Map<string, RegisteredAction>([
    ['getPublicSiteConfig', { validate: validatePublicPayload, async run() { return publicHandler.handle(); } }],
    ['getSiteConfig', { validate: validateSiteConfigPayload, async run(payload, identity) { return adminHandler.handle(validateSiteConfigPayload(payload), await identity()); } }],
    ['getShippingRegions', { validate: validatePublicPayload, async run() { return shippingHandler.handle(); } }],
    ['updateSiteConfig', { validate: validateUpdateSiteConfigPayload, async run(payload, identity) { return updateHandler.handle(validateUpdateSiteConfigPayload(payload), await identity()); } }],
    ...(catalog ? catalogActions(catalog) : []),
    ...(points ? createPointsActions(points) : []),
    ...(buyer ? createBuyerActions(buyer) : []),
    ...(transactions ? createTransactionActions(transactions) : []),
    ...(reconciliation ? createReconciliationActions(reconciliation) : []),
    ...(adminAudit ? createAdminAuditActions(adminAudit) : []),
  ]);
}
