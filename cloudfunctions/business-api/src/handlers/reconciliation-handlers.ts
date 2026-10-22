import type * as C from '../../../../packages/contracts/src/index';
import type { PaymentReconciliationService } from '../../../../packages/backend/src/services/payment-reconciliation-service';
export class ListPaymentReconciliationIssuesHandler { constructor(private readonly service: PaymentReconciliationService) {} handle(payload: C.ListReconciliationIssuesPayload, identity: C.TrustedIdentity) { return this.service.listIssues(payload, identity); } }
export class GetPaymentReconciliationIssueHandler { constructor(private readonly service: PaymentReconciliationService) {} handle(payload: C.ReconciliationIssuePayload, identity: C.TrustedIdentity) { return this.service.getIssue(payload, identity); } }
export class ResolvePaymentReconciliationIssueHandler { constructor(private readonly service: PaymentReconciliationService) {} handle(payload: C.ResolveReconciliationIssuePayload, identity: C.TrustedIdentity) { return this.service.resolveIssue(payload, identity); } }
