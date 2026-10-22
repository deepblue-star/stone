import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PointsLedgerDAO } from '../../packages/backend/src/dao/points-ledger-dao';
import { OrderDAO } from '../../packages/backend/src/dao/order-dao';
import { SkuDAO } from '../../packages/backend/src/catalog/sku-dao';
import { SkuCouponDAO } from '../../packages/backend/src/catalog/sku-coupon-dao';
it('filters bead exchange SKUs and available coupons using the category table type column', async () => {
  const statements: string[] = [];
  const db = { query: async <T>(query: string) => { statements.push(query); return [] as T[]; }, execute: async () => ({ insertId: '', affectedRows: 0 }) };
  await new SkuDAO(db).listExchangeSkus(null, null, 20);
  await new SkuCouponDAO(db).availableCounts('4');
  expect(statements).toHaveLength(2);
  const schema = readFileSync('database/migrations/001_initial_schema.sql', 'utf8');
  const tables: Record<string, string> = { s: 'catalog_skus', i: 'catalog_items', c: 'catalog_categories', q: 'user_sku_coupons' };
  const columns = Object.fromEntries(Object.entries(tables).map(([alias, table]) => {
    const definition = schema.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\)`))?.[1];
    expect(definition, `schema table ${table}`).toBeDefined();
    return [alias, new Set([...definition!.matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s+[A-Z]/gm)].map(match => match[1]))];
  }));
  for (const sql of statements) {
    expect(sql).toContain("c.catalog_type='BEAD'");
    expect(sql).not.toContain('i.catalog_type');
    for (const reference of sql.matchAll(/\b([sicq])\.([a-z_][a-z0-9_]*)\b/g)) expect(columns[reference[1]!]!.has(reference[2]), `unknown ${tables[reference[1]!]} column ${reference[2]}`).toBe(true);
  }
});
it('supports a current locking ledger read after the account serialization lock', async () => {
  let sql = '';
  const dao = new PointsLedgerDAO({ query: async <T>(query: string) => { sql = query; return [] as T[]; }, execute: async () => ({ insertId: '', affectedRows: 0 }) });
  await dao.findByEventKey('DAILY_CHECK_IN:4:2026-10-22', true);
  expect(sql).toContain('FOR UPDATE');
});
it('filters ledger direction with atomic SQL predicates before pagination', async () => {
  const statements: string[] = [];
  const dao = new PointsLedgerDAO({ query: async <T>(query: string) => { statements.push(query); return [] as T[]; }, execute: async () => ({ insertId: '', affectedRows: 0 }) });
  await dao.listByAccount('4', { direction: 'EARN' }, 20);
  await dao.listByAccount('4', { direction: 'SPEND' }, 20);
  expect(statements[0]).toContain('points_delta>0');
  expect(statements[1]).toContain('points_delta<0');
});
it('reads completed orders from current committed state for referral serialization', async () => {
  let sql = '';
  const dao = new OrderDAO({ query: async <T>(query: string) => { sql = query; return [] as T[]; }, execute: async () => ({ insertId: '', affectedRows: 0 }) });
  await dao.firstCompletedOrder('user', true);
  expect(sql).toContain('FOR UPDATE');
  expect(sql).not.toContain('is_deleted=0');
});
