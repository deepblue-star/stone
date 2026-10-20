import { describe, expect, it } from 'vitest';
import { CatalogItemDAO, SkuCouponDAO, createCatalogDaos } from '../../packages/backend/src/catalog/dao';
import type { DatabaseExecutor, SqlParameter } from '../../packages/backend/src/db/database';
describe('catalog SQL boundaries', () => {
  it('constructs concrete DAOs scoped to each main table', () => {
    const db: DatabaseExecutor = { async query() { return []; }, async execute() { return { affectedRows: 1, insertId: '1' }; } };
    const daos = createCatalogDaos(db);
    expect(Object.keys(daos)).toEqual(['categories', 'items', 'skus', 'reservations', 'inventoryMovements', 'skuCoupons', 'pointsAccounts', 'pointsLedger']);
    expect(Object.values(daos).map(dao => dao.constructor.name)).toEqual(['CategoryDAO', 'CatalogItemDAO', 'SkuDAO', 'ReservationDAO', 'InventoryMovementDAO', 'SkuCouponDAO', 'PointsAccountDAO', 'PointsLedgerDAO']);
  });
  it('parameterizes keyword filters and uses stable typed cursor fields', async () => {
    const calls: { sql: string; params: readonly SqlParameter[] }[] = [];
    const db: DatabaseExecutor = { async query<T>(sql: string, params: readonly SqlParameter[] = []): Promise<readonly T[]> { calls.push({ sql, params }); return []; }, async execute() { return { affectedRows: 1, insertId: '1' }; } };
    const dao = new CatalogItemDAO(db);
    await dao.list({ keyword: "%' OR 1=1 --", categoryId: '9007199254740999' }, { id: '9007199254740998' }, 21);
    expect(calls[0]?.sql).not.toContain("OR 1=1 --");
    expect(calls[0]?.params).toEqual(['9007199254740999', "%=%' OR 1==1 --%", '9007199254740998', 21]);
    expect(calls[0]?.sql).toContain('ORDER BY i.id LIMIT ?');
  });
  it('locks only item rows and then coupons without implicitly locking accounts out of order', async () => {
    const sqls: string[] = [];
    const db: DatabaseExecutor = { async query<T>(sql: string): Promise<readonly T[]> { sqls.push(sql); return []; }, async execute() { return { affectedRows: 1, insertId: '1' }; } };
    await new CatalogItemDAO(db).findById('1', true); await new SkuCouponDAO(db).listActiveBySku('1', true);
    expect(sqls[0]).toContain('FOR UPDATE OF i');
    expect(sqls[1]).not.toContain('JOIN points_accounts');
    expect(sqls[1]).toContain('ORDER BY q.id FOR UPDATE');
  });
});
