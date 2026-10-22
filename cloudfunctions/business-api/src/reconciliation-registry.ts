import type * as C from '../../../packages/contracts/src/index';
import { validateReconciliationPayload, type PaymentReconciliationService } from '../../../packages/backend/src/services/payment-reconciliation-service';
import type { RegisteredAction } from './action-registry';
import * as H from './handlers/reconciliation-handlers';
export function createReconciliationActions(service: PaymentReconciliationService): [string, RegisteredAction][] {
  function trusted<P>(action: string, handler: { handle(payload: P, identity: C.TrustedIdentity): Promise<unknown> }): [string, RegisteredAction] {
    return [action, { validate: payload => validateReconciliationPayload(action, payload), async run(payload, identity) { return handler.handle(validateReconciliationPayload(action, payload) as P, await identity()); } }];
  }
  return [trusted('listPaymentReconciliationIssues', new H.ListPaymentReconciliationIssuesHandler(service)), trusted('getPaymentReconciliationIssue', new H.GetPaymentReconciliationIssueHandler(service)), trusted('resolvePaymentReconciliationIssue', new H.ResolvePaymentReconciliationIssueHandler(service))];
}
