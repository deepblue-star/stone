import { existsSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { DaoSet, PaymentRow, ReconciliationIssueRow } from '../../packages/backend/src/dao/index';
import { AdminAccessService } from '../../packages/backend/src/services/admin-access-service';
import type { AdminDAO } from '../../packages/backend/src/dao/admin-dao';

const base: ReconciliationIssueRow = { id: '1', run_id: '2', issue_type: 'OTHER', order_id: null, order_no: null, out_trade_no: 'alpha-reconcile', transaction_id: null, local_status: null, wechat_trade_state: null, local_amount_cent: null, wechat_amount_cent: null, resolution_status: 'OPEN', resolution_note: null, resolved_by: null, resolved_at: null, created_at: '2026-10-21T13:00:00Z', updated_at: '2026-10-21T13:00:00Z', is_deleted: 0 };
const admin = { kind: 'web' as const, uid: 'synthetic-admin' };
const listInput = { resolution_status: 'OPEN', bill_date: null, issue_type: null, page_token: null, page_size: 20 };
async function fixture() {
  expect(existsSync('packages/backend/src/services/payment-reconciliation-service.ts')).toBe(true);
  const modulePath = '../../packages/backend/src/services/payment-reconciliation-service.ts';
  const { PaymentReconciliationService } = await import(modulePath) as typeof import('../../packages/backend/src/services/payment-reconciliation-service');
  let row: ReconciliationIssueRow | null = { ...base };
  const findById = vi.fn(async () => row ? { ...row } : null);
  const listForAdmin = vi.fn(async (_filter: unknown, _limit: number, _before?: unknown) => row ? [{ ...row, bill_date: '2026-10-21' }] : []);
  const updateResolution = vi.fn(async (_id: string, expected: string, values: { resolution_status: string; resolution_note: string | null; resolved_by: string | null; resolved_at: Date | string | null }) => {
    if (!row || row.resolution_status !== expected) return 0;
    row = { ...row, ...values } as ReconciliationIssueRow; return 1;
  });
  const findByOutTradeNo = vi.fn(async (_no: string): Promise<PaymentRow | null> => null);
  const daos = {
    reconciliationIssues: { findById, listForAdmin, updateResolution, countUnresolved: vi.fn(async () => '1') },
    reconciliationRuns: { findById: vi.fn(async () => ({ id: '2', bill_date: '2026-10-21', status: 'SUCCESS' })) },
    orders: { findById: vi.fn(async () => null), updateState: vi.fn() },
    payments: { findByOrderId: vi.fn(async () => null), findByOutTradeNo, updateProviderResult: vi.fn() },
  } as unknown as DaoSet;
  const access = new AdminAccessService({ findEnabledByAuthUid: vi.fn(async (uid: string) => ({ id: '3', auth_uid: uid, display_name: '测试管理员' })) } as unknown as AdminDAO);
  const service = new PaymentReconciliationService(daos, access, { tokenSecret: 'a'.repeat(32), now: () => new Date('2026-10-22T05:00:00Z') });
  return { service, daos, findById, listForAdmin, updateResolution, findByOutTradeNo, setRow: (value: ReconciliationIssueRow | null) => { row = value; } };
}

it('returns bill-date list summaries, exact amounts and an unresolved count', async () => {
  const f = await fixture();
  f.setRow({ ...base, local_amount_cent: '9007199254740993', wechat_amount_cent: '9007199254740994' });
  expect(await f.service.listIssues(listInput, admin)).toMatchObject({ issues: [{ issue_id: '1', bill_date: '2026-10-21', local_amount_cent: '9007199254740993' }], open_count: '1', next_page_token: null });
  expect(f.listForAdmin).toHaveBeenCalledWith({ resolutionStatus: 'OPEN' }, 21, undefined);
});
it('rejects native/anonymous identities and does not query issue data', async () => {
  const f = await fixture();
  await expect(f.service.listIssues(listInput, { kind: 'wechat', openid: 'synthetic-native' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  await expect(f.service.getIssue({ issue_id: '1' }, { kind: 'anonymous' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(f.findById).not.toHaveBeenCalled(); expect(f.listForAdmin).not.toHaveBeenCalled();
});
it('returns complete issue fields and nullable related summaries without exposing caller metadata', async () => {
  const f = await fixture();
  const result = await f.service.getIssue({ issue_id: '001' }, admin);
  expect(result).toMatchObject({ issue_id: '1', bill_date: '2026-10-21', out_trade_no: 'alpha-reconcile', related_order: null, related_payment: null });
  expect(f.findById).toHaveBeenCalledWith('1');
  expect(result).not.toHaveProperty('context'); expect(result).not.toHaveProperty('openid');
});
it('marks only the issue resolved and makes identical note/status replay idempotent', async () => {
  const f = await fixture(); const input = { issue_id: '1', resolution_status: 'RESOLVED', resolution_note: ' 已核对开发样例 ' };
  expect(await f.service.resolveIssue(input, admin)).toMatchObject({ issue_id: '1', resolution_status: 'RESOLVED', resolution_note: '已核对开发样例', resolved_by: admin.uid, resolved_at: '2026-10-22T05:00:00.000Z', idempotent_replay: false });
  expect(await f.service.resolveIssue(input, admin)).toMatchObject({ idempotent_replay: true });
  expect(f.updateResolution).toHaveBeenCalledTimes(1);
  expect(f.daos.orders.updateState).not.toHaveBeenCalled(); expect(f.daos.payments.updateProviderResult).not.toHaveBeenCalled();
});
it('does not overwrite a previously handled issue with a different result', async () => {
  const f = await fixture(); f.setRow({ ...base, resolution_status: 'IGNORED', resolution_note: '确认非异常' });
  await expect(f.service.resolveIssue({ issue_id: '1', resolution_status: 'RESOLVED', resolution_note: '另一说明' }, admin)).rejects.toMatchObject({ code: 'ISSUE_ALREADY_RESOLVED' });
  expect(f.updateResolution).not.toHaveBeenCalled();
});
it('re-reads a conditional-update loser and accepts only identical results', async () => {
  const f = await fixture();
  f.updateResolution.mockImplementationOnce(async () => { f.setRow({ ...base, resolution_status: 'RESOLVED', resolution_note: '先处理的说明' }); return 0; });
  await expect(f.service.resolveIssue({ issue_id: '1', resolution_status: 'RESOLVED', resolution_note: '后处理的说明' }, admin)).rejects.toMatchObject({ code: 'ISSUE_ALREADY_RESOLVED' });
  expect(f.findById).toHaveBeenCalledTimes(2);
});
it('reports missing issues and rejects invalid transition or whitespace notes', async () => {
  const f = await fixture(); f.setRow(null);
  await expect(f.service.getIssue({ issue_id: '1' }, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  for (const payload of [{ issue_id: '1', resolution_status: 'OPEN', resolution_note: '不能重开' }, { issue_id: '1', resolution_status: 'RESOLVED', resolution_note: ' ' }, { issue_id: '1', resolution_status: 'RESOLVED', resolution_note: '备注', resolved_by: 'spoofed' }]) await expect(f.service.resolveIssue(payload, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(f.updateResolution).not.toHaveBeenCalled();
});
it.each(['missing', 'deleted'] as const)('does not display, resolve or replay an issue under a %s reconciliation run', async kind => {
  const f = await fixture();
  vi.spyOn(f.daos.reconciliationRuns, 'findById').mockResolvedValue(kind === 'missing' ? null : { id: '2', bill_date: '2026-10-21', status: 'SUCCESS', total_count: 0, matched_count: 0, issue_count: 1, started_at: '2026-10-21T13:00:00Z', finished_at: '2026-10-21T13:01:00Z', error_message: null, created_at: '2026-10-21T13:00:00Z', updated_at: '2026-10-21T13:01:00Z', is_deleted: 1 });
  await expect(f.service.getIssue({ issue_id: '1' }, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const input = { issue_id: '1', resolution_status: 'RESOLVED', resolution_note: '已核对' };
  await expect(f.service.resolveIssue(input, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  f.setRow({ ...base, resolution_status: 'RESOLVED', resolution_note: input.resolution_note });
  await expect(f.service.resolveIssue(input, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.updateResolution).not.toHaveBeenCalled();
});
it('validates calendar dates and enum filters before DAO queries', async () => {
  const f = await fixture();
  for (const patch of [{ bill_date: '2026-02-30' }, { resolution_status: 'PAID' }, { issue_type: 'MISSING' }, { page_size: 101 }]) await expect(f.service.listIssues({ ...listInput, ...patch }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(f.listForAdmin).not.toHaveBeenCalled();
});
it('enforces the existing 500-character database note limit before writing', async () => {
  const f = await fixture();
  await expect(f.service.resolveIssue({ issue_id: '1', resolution_status: 'RESOLVED', resolution_note: '测'.repeat(501) }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(f.updateResolution).not.toHaveBeenCalled();
});
it('locates payment by merchant order number when the original issue has no local order link', async () => {
  const f = await fixture();
  f.findByOutTradeNo.mockResolvedValueOnce({ id: '7', order_id: '44', out_trade_no: 'alpha-reconcile', prepay_id: null, transaction_id: 'synthetic-provider-id', trade_state: 'SUCCESS', success_time: '2026-10-21T13:00:00Z', created_at: '2026-10-21T13:00:00Z', updated_at: '2026-10-21T13:00:00Z', is_deleted: 0 });
  expect(await f.service.getIssue({ issue_id: '1' }, admin)).toMatchObject({ related_payment: { out_trade_no: 'alpha-reconcile', transaction_id: 'synthetic-provider-id', trade_state: 'SUCCESS', success_time: '2026-10-21T13:00:00.000Z' } });
  expect(f.findByOutTradeNo).toHaveBeenCalledWith('alpha-reconcile');
  expect(f.daos.orders.findById).toHaveBeenCalledWith('44');
});
it('does not skip an OPEN issue when a previously displayed row is resolved between pages', async () => {
  const f = await fixture();
  let open = ['3', '2', '1'].map(id => ({ ...base, id, bill_date: '2026-10-21' }));
  f.listForAdmin.mockImplementation(async (_filter, limit, before) => {
    if (typeof before === 'number') return open.slice(before, before + limit);
    const cursorId = before && typeof before === 'object' && 'id' in before ? String(before.id) : null;
    return open.filter(row => !cursorId || BigInt(row.id) < BigInt(cursorId)).slice(0, limit);
  });
  const first = await f.service.listIssues({ ...listInput, page_size: 1 }, admin);
  expect(first.issues[0]?.issue_id).toBe('3');
  open = open.filter(row => row.id !== '3');
  const second = await f.service.listIssues({ ...listInput, page_size: 1, page_token: first.next_page_token }, admin);
  expect(second.issues[0]?.issue_id).toBe('2');
  expect(second.next_page_token).not.toBeNull();
  await expect(f.service.listIssues({ ...listInput, page_size: 1, resolution_status: 'RESOLVED', page_token: first.next_page_token }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
});
