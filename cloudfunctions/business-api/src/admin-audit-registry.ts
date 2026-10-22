import type { TrustedIdentity } from '../../../packages/contracts/src/index';
import type { AdminAuditService } from '../../../packages/backend/src/services/admin-audit-service';
import type { RegisteredAction } from './action-registry';
import { ListAdminPointsLedgerHandler, ListAdminReferralRelationsHandler, ListAdminSkuCouponsHandler } from './handlers/admin-audit-handlers';
export function createAdminAuditActions(service: AdminAuditService): [string, RegisteredAction][] {
  function action(name: string, handler: { handle(payload: unknown, identity: TrustedIdentity): Promise<unknown> }): [string, RegisteredAction] {
    // Audit service authorizes first, then validates; payload identity fields are never trusted.
    return [name, { validate: payload => payload, async run(payload, resolveIdentity) { return handler.handle(payload, await resolveIdentity()); } }];
  }
  return [action('listAdminPointsLedger', new ListAdminPointsLedgerHandler(service)), action('listAdminReferralRelations', new ListAdminReferralRelationsHandler(service)), action('listAdminSkuCoupons', new ListAdminSkuCouponsHandler(service))];
}
