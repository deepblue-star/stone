import { expect, it } from 'vitest';
import { createDaos } from '../../packages/backend/src/dao/index';
import type { DatabaseExecutor, SqlParameter } from '../../packages/backend/src/db/database';
it('builds parameterized atomic keyset queries preserving historical account/catalog/order references', async () => {
  const calls: { sql: string; params: readonly SqlParameter[] }[] = [];
  const db: DatabaseExecutor = { async query<Row>(sql: string, params: readonly SqlParameter[] = []) { calls.push({ sql, params }); return [] as Row[]; }, async execute() { throw new Error('read only'); } };
  const d = createDaos(db);
  const before = { createdAt: '2026-10-22 00:00:00.000', id: '9007199254740993' };
  await d.pointsLedger.listForAdmin({ openid: "test' OR 1=1", sourceType: 'DAILY_CHECK_IN', createdFrom: '2026-10-21 00:00:00.000', createdTo: '2026-10-23 00:00:00.000' }, 21, before);
  await d.referrals.listForAdmin({ inviterOpenid: 'test-inviter', inviteeOpenid: 'test-invitee', rewarded: false }, 21, before);
  await d.skuCoupons.listForAdmin({ skuId: '3', openid: 'test-owner', status: 'LOCKED' }, 21, before);
  expect(calls).toHaveLength(3);
  for (const c of calls) { expect(c.sql).toContain('LEFT JOIN points_accounts'); expect(c.sql).toMatch(/created_at < \? OR \(\w+\.created_at = \? AND \w+\.id < \?\)/); expect(c.sql).toMatch(/ORDER BY \w+\.created_at DESC,\w+\.id DESC LIMIT \?/); expect(c.sql).not.toMatch(/OFFSET|FOR UPDATE|a\.is_deleted|inviter\.is_deleted|invitee\.is_deleted/); expect(c.params.slice(-4)).toEqual([before.createdAt, before.createdAt, before.id, 21]); }
  expect(calls[0]?.sql).not.toContain("test' OR 1=1");
  expect(calls[0]?.params.slice(0, 4)).toEqual(["test' OR 1=1", 'DAILY_CHECK_IN', '2026-10-21 00:00:00.000', '2026-10-23 00:00:00.000']);
  expect(calls[1]?.sql).toContain('rewarded_order_no IS NULL');
  expect(calls[2]?.sql).toContain('LEFT JOIN catalog_skus'); expect(calls[2]?.sql).toContain('LEFT JOIN catalog_items'); expect(calls[2]?.sql).toContain('LEFT JOIN orders locked_order'); expect(calls[2]?.sql).toContain('LEFT JOIN orders used_order');
  expect(calls[2]?.sql.split(' WHERE ')[1]).not.toMatch(/s\.is_deleted|i\.is_deleted|s\.is_on_sale|i\.is_on_sale/);
  expect(calls[0]?.sql).toContain('CAST(l.points_delta AS CHAR)');
});
