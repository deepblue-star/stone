import type * as C from '../../../../packages/contracts/src/index';
import type { AdminAuditService } from '../../../../packages/backend/src/services/admin-audit-service';
export class ListAdminPointsLedgerHandler { constructor(private readonly service: AdminAuditService) {} handle(payload: unknown, identity: C.TrustedIdentity) { return this.service.listPointsLedger(payload, identity); } }
export class ListAdminReferralRelationsHandler { constructor(private readonly service: AdminAuditService) {} handle(payload: unknown, identity: C.TrustedIdentity) { return this.service.listReferralRelations(payload, identity); } }
export class ListAdminSkuCouponsHandler { constructor(private readonly service: AdminAuditService) {} handle(payload: unknown, identity: C.TrustedIdentity) { return this.service.listSkuCoupons(payload, identity); } }
