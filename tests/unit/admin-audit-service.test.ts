import { existsSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createDaos } from '../../packages/backend/src/dao/index';
import type { DatabaseExecutor, SqlParameter } from '../../packages/backend/src/db/database';
import { AdminAccessService } from '../../packages/backend/src/services/admin-access-service';
import { PageTokens } from '../../packages/backend/src/catalog/rules';

const admin = { kind: 'web' as const, uid: 'audit-test-admin' };
const input = { page_token: null, page_size: 1 };
const secret = 'audit-test-signing-secret-32-characters';
const ledger = { id: '9007199254740995', account_id: '9007199254740994', _openid: 'test-openid-12345678', points_delta: '-9007199254740993', balance_after: '9007199254740996', source_type: 'POINTS_EXCHANGE', source_ref: 'test-source', description: '测试积分流水', created_at: '2026-10-22 01:00:00' };
const coupon = { id: '9', account_id: '2', _openid: 'test-openid-12345678', sku_id: '3', status: 'USED', points_cost_snapshot: 20, source_type: 'POINTS_EXCHANGE', source_ref: null, locked_order_no: null, locked_at: null, used_order_no: 'test-order', used_at: '2026-10-22 02:00:00', refunded_at: null, refund_reason: null, created_at: '2026-10-22 01:00:00', item_name: '测试材料', diameter_mm: '8.00', image_file_id: 'cloud://test/selected.png', sku_is_on_sale: 0, item_is_on_sale: 1, sku_is_deleted: 1, item_is_deleted: 0 };
async function fixture() {
  expect(existsSync('packages/backend/src/services/admin-audit-service.ts')).toBe(true);
  const path = '../../packages/backend/src/services/admin-audit-service.ts';
  const { AdminAuditService } = await import(path) as typeof import('../../packages/backend/src/services/admin-audit-service');
  const calls: { sql: string; params: readonly SqlParameter[] }[] = [];
  let rows: readonly unknown[] = [];
  const db: DatabaseExecutor = {
    async query<Row>(sql: string, params: readonly SqlParameter[] = []) { calls.push({ sql, params }); return (sql.includes('FROM admin_allowlist') ? params[0] === admin.uid || params[0] === 'audit-second-admin' ? [{ id: '1', auth_uid: params[0], display_name: '测试管理员' }] : [] : rows) as readonly Row[]; },
    execute: vi.fn(async () => { throw new Error('audit must never write'); }),
  };
  const daos = createDaos(db);
  const images = { resolve: vi.fn(async (ids: readonly string[]) => Object.fromEntries(ids.map(id => [id, 'https://example.test/selected.png']))) };
  return { service: new AdminAuditService(daos, new AdminAccessService(daos.admin), { tokenSecret: secret, images }), calls, db, images, setRows: (value: readonly unknown[]) => { rows = value; } };
}
it('requires an allowlisted web session before validation or audit reads and never writes accounts', async () => {
  const f = await fixture();
  for (const identity of [{ kind: 'anonymous' } as const, { kind: 'wechat', openid: 'test-wechat' } as const, { kind: 'web', uid: 'not-allowlisted' } as const]) {
    await expect(f.service.listPointsLedger({ ...input, uid: admin.uid }, identity)).rejects.toMatchObject({ code: identity.kind === 'web' ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    await expect(f.service.listReferralRelations(input, identity)).rejects.toMatchObject({ code: identity.kind === 'web' ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    await expect(f.service.listSkuCoupons(input, identity)).rejects.toMatchObject({ code: identity.kind === 'web' ? 'FORBIDDEN' : 'UNAUTHORIZED' });
  }
  expect(f.calls.every(c => c.sql.includes('admin_allowlist'))).toBe(true);
  expect(f.db.execute).not.toHaveBeenCalled();
});
it('validates plain payloads, required pagination, enum, identity spoofing and calendar instants before reads', async () => {
  const f = await fixture();
  for (const p of [null, [], new Date(), {}, { ...input, uid: admin.uid }, { ...input, openid: ' ' }, { ...input, source_type: 'UNKNOWN' }, { ...input, page_token: undefined }, { ...input, page_size: 101 }, { ...input, page_size: 1.5 }, { ...input, page_token: 'x'.repeat(2049) }, { ...input, created_from: '2026-02-30T01:00:00Z' }, { ...input, created_from: '2026-10-22T01:00:00' }, { ...input, created_from: '2026-10-23T00:00:00Z', created_to: '2026-10-22T00:00:00Z' }]) await expect(f.service.listPointsLedger(p, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(f.service.listReferralRelations({ ...input, rewarded: 'false' }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  for (const sku_id of ['0', '-1', '18446744073709551616', 3]) await expect(f.service.listSkuCoupons({ ...input, sku_id }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(f.service.listSkuCoupons({ ...input, status: 'DELETED' }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(f.calls.every(c => c.sql.includes('admin_allowlist'))).toBe(true);
});
it('preserves exact large values, masks OpenID and normalizes date and optional filters', async () => {
  const f = await fixture(); f.setRows([ledger]);
  const result = await f.service.listPointsLedger({ ...input, openid: ' test-openid-12345678 ', source_type: 'POINTS_EXCHANGE', created_from: '2026-10-22T09:00:00+08:00' }, admin);
  expect(result).toMatchObject({ items: [{ ledger_id: ledger.id, account_id: ledger.account_id, points_delta: ledger.points_delta, balance_after: ledger.balance_after, created_at: '2026-10-22T01:00:00.000Z' }], next_page_token: null });
  expect(JSON.stringify(result)).not.toContain(ledger._openid);
  expect(result.items[0]?.openid_masked).toContain('***');
  expect(f.calls.at(-1)?.params).toEqual(['test-openid-12345678', 'POINTS_EXCHANGE', '2026-10-22 01:00:00.000', 2]);
});
it('rejects submillisecond precision and reversed millisecond bounds before querying audit data', async () => {
  const f = await fixture();
  for (const range of [
    { created_from: '2026-10-22T01:00:00.0009Z', created_to: '2026-10-22T01:00:00.0001Z' },
    { created_from: '2026-10-22T01:00:00.0001Z' },
    { created_to: '2026-10-22T01:00:00.0010Z' },
    { created_from: '2026-10-22T01:00:00.002Z', created_to: '2026-10-22T01:00:00.001Z' },
  ]) await expect(f.service.listPointsLedger({ ...input, ...range }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(f.calls.every(call => call.sql.includes('admin_allowlist'))).toBe(true);
});
it('rejects timestamps whose UTC conversion falls outside the MySQL DATETIME year range', async () => {
  const f = await fixture();
  for (const created_from of ['9999-12-31T23:59:59-01:00', '1000-01-01T00:00:00+01:00', '0999-12-31T23:59:59Z']) await expect(f.service.listPointsLedger({ ...input, created_from }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(f.calls.every(call => call.sql.includes('admin_allowlist'))).toBe(true);
});
it('retains exact milliseconds and treats equivalent timezone bounds as the same pagination scope', async () => {
  const f = await fixture(); f.setRows([ledger, { ...ledger, id: '9007199254740994' }]);
  const first = await f.service.listPointsLedger({ ...input, created_from: '2026-10-22T09:00:00.001+08:00', created_to: '2026-10-22T09:00:01.001+08:00' }, admin);
  expect(f.calls.at(-1)?.params).toEqual(['2026-10-22 01:00:00.001', '2026-10-22 01:00:01.001', 2]);
  await expect(f.service.listPointsLedger({ ...input, page_token: first.next_page_token, created_from: '2026-10-22T01:00:00.001Z', created_to: '2026-10-22T01:00:01.001Z' }, admin)).resolves.toMatchObject({ items: [{ ledger_id: ledger.id }] });
  for (const created_from of ['1000-01-01T00:00:00Z', '9999-12-31T23:59:59.999Z']) await expect(f.service.listPointsLedger({ ...input, created_from }, admin)).resolves.toHaveProperty('items');
});
it('uses a time-and-ID cursor scoped to admin, action and normalized filters', async () => {
  const f = await fixture(); f.setRows([ledger, { ...ledger, id: '9007199254740994' }]);
  const first = await f.service.listPointsLedger(input, admin);
  expect(first.next_page_token).not.toBeNull();
  f.setRows([{ ...ledger, id: '9007199254740994' }]);
  expect((await f.service.listPointsLedger({ ...input, page_token: first.next_page_token, source_type: null }, admin)).items[0]?.ledger_id).toBe('9007199254740994');
  expect(f.calls.at(-1)?.params).toEqual(['2026-10-22 01:00:00.000', '2026-10-22 01:00:00.000', ledger.id, 2]);
  for (const p of [{ ...input, openid: 'another', page_token: first.next_page_token }, { ...input, source_type: 'POINTS_EXCHANGE', page_token: first.next_page_token }]) await expect(f.service.listPointsLedger(p, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(f.service.listPointsLedger({ ...input, page_token: first.next_page_token }, { kind: 'web', uid: 'audit-second-admin' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  await expect(f.service.listReferralRelations({ ...input, page_token: first.next_page_token }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  const tokens = new PageTokens(secret); const decoded = JSON.parse(Buffer.from(first.next_page_token!.split('.')[0]!, 'base64url').toString()) as { scope: string };
  for (const time of [undefined, 'bad-time', '2026-02-30T00:00:00Z']) await expect(f.service.listPointsLedger({ ...input, page_token: tokens.encode(decoded.scope, { id: ledger.id, ...(time ? { time } : {}) }) }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
});
it('returns referral audit fields and masked identities including unrewarded relations', async () => {
  const f = await fixture(); f.setRows([{ id: '8', inviter_account_id: '2', invitee_account_id: '3', inviter_openid: 'test-inviter-123456', invitee_openid: 'test-invitee-123456', bind_channel: 'SHARE_PATH', invite_code_snapshot: 'TEST', rewarded_order_no: null, rewarded_at: null, created_at: ledger.created_at }]);
  const result = await f.service.listReferralRelations({ ...input, rewarded: false, inviter_openid: ' test-inviter-123456 ' }, admin);
  expect(result.items[0]).toMatchObject({ relation_id: '8', inviter_account_id: '2', invitee_account_id: '3', rewarded_at: null, rewarded_order_no: null });
  expect(JSON.stringify(result)).not.toContain('test-inviter-123456');
  expect(result.items[0]?.invitee_openid_masked).toContain('***');
  expect(f.calls.at(-1)?.sql).toContain('rewarded_order_no IS NULL');
});
it('retains coupons with off-sale, soft-deleted and missing current catalog and resolves selected-page images only', async () => {
  const f = await fixture(); f.setRows([coupon, { ...coupon, id: '8', image_file_id: 'cloud://test/next.png' }]);
  const result = await f.service.listSkuCoupons({ ...input, sku_id: '0003' }, admin);
  expect(result.items[0]).toMatchObject({ coupon_id: '9', used_order_no: 'test-order', locked_order_no: null, current_sku: { item_name: '测试材料', diameter_mm: 8, image_file_id: coupon.image_file_id, is_on_sale: false, is_deleted: true } });
  expect(f.images.resolve).toHaveBeenLastCalledWith([coupon.image_file_id]);
  expect(f.calls.at(-1)?.params).toEqual(['3', 2]);
  f.setRows([{ ...coupon, item_name: null, diameter_mm: null, image_file_id: null, sku_is_deleted: null, item_is_deleted: null, sku_is_on_sale: null, item_is_on_sale: null }]);
  expect((await f.service.listSkuCoupons(input, admin)).items[0]?.current_sku).toEqual({ item_name: null, diameter_mm: null, image_file_id: null, is_on_sale: false, is_deleted: true });
  expect(f.db.execute).not.toHaveBeenCalled();
});
it('reports a missing parent item as unavailable current catalog with explicit null display fields', async () => {
  const f = await fixture(); f.setRows([{ ...coupon, item_name: null, item_is_deleted: null, item_is_on_sale: null, sku_is_deleted: 0 }]);
  const result = await f.service.listSkuCoupons(input, admin);
  expect(result.items[0]?.current_sku).toEqual({ item_name: null, diameter_mm: null, image_file_id: null, is_on_sale: false, is_deleted: true });
  expect(f.images.resolve).toHaveBeenCalledWith([]);
});
