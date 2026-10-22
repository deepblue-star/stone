import { expect, it, vi } from 'vitest';
import { createBusinessApi } from '../../cloudfunctions/business-api/src/app';
import type { SiteConfigService } from '../../packages/backend/src/services/site-config-service';
import type { PaymentReconciliationService } from '../../packages/backend/src/services/payment-reconciliation-service';
it('routes reconciliation through thin handlers using only trusted identity', async () => {
  const listIssues = vi.fn(async () => ({ issues: [], next_page_token: null, open_count: '0' }));
  const identity = vi.fn(async () => ({ kind: 'web' as const, uid: 'trusted-admin' }));
  const api = createBusinessApi({ siteConfigService: {} as SiteConfigService, reconciliationService: { listIssues } as unknown as PaymentReconciliationService, resolveIdentity: identity, log() {} });
  const payload = { resolution_status: 'OPEN', bill_date: null, issue_type: null, page_token: null, page_size: 20 };
  expect(await api({ action: 'listPaymentReconciliationIssues', payload, uid: 'spoofed' }, {})).toMatchObject({ ok: true, data: { issues: [], open_count: '0' } });
  expect(listIssues).toHaveBeenCalledWith(payload, { kind: 'web', uid: 'trusted-admin' });
  identity.mockClear();
  expect(await api({ action: 'resolvePaymentReconciliationIssue', payload: { issue_id: '1', resolution_status: 'RESOLVED', resolution_note: '核对', resolved_by: 'spoofed' } }, {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
  expect(identity).not.toHaveBeenCalled();
});
