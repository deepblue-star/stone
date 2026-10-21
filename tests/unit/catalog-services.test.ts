import { describe, expect, it, vi } from 'vitest';
import { AdminCatalogService } from '../../packages/backend/src/services/admin-catalog-service';
import { InventoryService } from '../../packages/backend/src/services/inventory-service';
import { CatalogService } from '../../packages/backend/src/services/catalog-service';
import { AdminAccessService } from '../../packages/backend/src/services/admin-access-service';
import { PageTokens, deactivationHash } from '../../packages/backend/src/catalog/rules';
import type { CatalogDaos, SkuRow } from '../../packages/backend/src/catalog/dao';
import type { UnitOfWork } from '../../packages/backend/src/db/unit-of-work';
import type { AdminDAO } from '../../packages/backend/src/dao';

const sku: SkuRow = { id: '1', item_id: '2', spec_values: null, spec_signature: null, diameter_mm: 8, image_file_id: null, price_cent: '100', points_exchange_enabled: 1, points_cost: 99, stock_total: 10, stock_reserved: 0, is_on_sale: 1, is_deleted: 0, updated_at: '2026-10-21 00:00:00' };
function fixture(overrides: Record<string, Record<string, unknown>> = {}) {
  const events: string[] = [];
  const daos = {
    categories: {
      findById: vi.fn(async () => ({ id: '3', catalog_type: 'BEAD', is_enabled: 1, is_deleted: 0, name: '珠子', sort_order: 1, updated_at: '2026-10-21 00:00:00' })),
      list: vi.fn(async () => []), save: vi.fn(async () => '3'), softDelete: vi.fn(async () => { events.push('remove'); }), ...overrides.categories,
    },
    items: {
      findById: vi.fn(async () => ({ id: '2', category_id: '3', catalog_type: 'BEAD', is_deleted: 0, is_on_sale: 1, name: '白水晶', description: null, images: [], spec_schema: null, updated_at: '2026-10-21 00:00:00' })),
      list: vi.fn(async () => []), hasAnyByCategory: vi.fn(async () => false), save: vi.fn(async () => '2'), softDelete: vi.fn(async () => { events.push('remove'); }), ...overrides.items,
    },
    skus: {
      findById: vi.fn(async () => ({ ...sku })), listByItemIds: vi.fn(async () => []), save: vi.fn(async () => '1'),
      updateSpec: vi.fn(async () => {}), adjustStock: vi.fn(async () => { events.push('stock'); }), softDelete: vi.fn(async () => { events.push('remove'); }), ...overrides.skus,
    },
    reservations: { countPendingOrders: vi.fn(async () => 0), ...overrides.reservations },
    inventoryMovements: {
      findByEventKey: vi.fn(async () => null), insertAdjustment: vi.fn(async () => { events.push('movement'); }), listBySku: vi.fn(async () => []), ...overrides.inventoryMovements,
    },
    skuCoupons: {
      listActiveBySku: vi.fn(async () => []), markRefunded: vi.fn(async () => { events.push('coupon'); }), ...overrides.skuCoupons,
    },
    pointsAccounts: {
      findForUpdate: vi.fn(async () => { events.push('account'); return { id: '4', balance: '50', total_earned: '100', total_spent: '50' }; }), updateBalance: vi.fn(async () => { events.push('balance'); }),
    },
    pointsLedger: { findByEventKey: vi.fn(async () => null), insert: vi.fn(async () => { events.push('ledger'); return '7'; }) },
  };
  const uow = { run: async <T>(callback: (d: CatalogDaos) => Promise<T>) => callback(daos as unknown as CatalogDaos) } as UnitOfWork<CatalogDaos>;
  const access = new AdminAccessService({ findEnabledByAuthUid: vi.fn(async () => ({ id: '9', auth_uid: 'admin', display_name: 'Admin' })) } as unknown as AdminDAO);
  const tokens = new PageTokens('catalog-test-secret-at-least-32-characters');
  return { daos, events, inventory: new InventoryService(daos as unknown as CatalogDaos, uow, access, tokens), admin: new AdminCatalogService(daos as unknown as CatalogDaos, uow, access, tokens, { assertCanReference: async () => {} }), public: new CatalogService(daos as unknown as CatalogDaos, tokens, () => {}) };
}
const identity = { kind: 'web' as const, uid: 'admin' };
describe('catalog permissions, inventory and refunds', () => {
  it('checks trusted admin identity before accessing inventory data', async () => {
    const f = fixture();
    await expect(f.inventory.adjustInventory({ operation_key: 'one', sku_id: '1', stock_delta: 1, remark: '盘点' }, { kind: 'anonymous' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(f.daos.skus.findById).not.toHaveBeenCalled();
  });
  it('updates stock once and rejects conflicting operation-key reuse', async () => {
    const f = fixture();
    await expect(f.inventory.adjustInventory({ operation_key: 'one', sku_id: '1', stock_delta: 2, remark: '盘点' }, identity)).resolves.toMatchObject({ stock_total: 12 });
    expect(f.events).toEqual(['stock', 'movement']);
    f.daos.inventoryMovements.findByEventKey.mockResolvedValue({ stock_delta: 2, remark: '盘点', operator_uid: 'admin' } as never);
    f.events.length = 0;
    await f.inventory.adjustInventory({ operation_key: 'one', sku_id: '1', stock_delta: 2, remark: '盘点' }, identity);
    expect(f.events).toEqual([]);
    await expect(f.inventory.adjustInventory({ operation_key: 'one', sku_id: '1', stock_delta: 3, remark: '盘点' }, identity)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('prevents deactivation with reservations or inconsistent locked coupons', async () => {
    const f = fixture({ skus: { findById: vi.fn(async () => ({ ...sku, stock_reserved: 1 })) } });
    const preview = await f.admin.previewSkuDeactivation({ sku_id: '1', operation: 'DELETE' }, identity);
    expect(preview).toMatchObject({ can_execute: false, impact_hash: null });
    await expect(f.admin.deleteSku({ sku_id: '1', impact_hash: 'a'.repeat(64) }, identity)).rejects.toMatchObject({ code: 'SKU_HAS_PENDING_ORDERS' });
    const g = fixture({ skuCoupons: { listActiveBySku: vi.fn(async () => [{ coupon_id: '5', account_id: '4', status: 'LOCKED', points_cost_snapshot: 20, _openid: 'openid-example' }]) } });
    expect(await g.admin.previewSkuDeactivation({ sku_id: '1', operation: 'DELETE' }, identity)).toMatchObject({ can_execute: false, impact_hash: null });
    await expect(g.admin.deleteSku({ sku_id: '1', impact_hash: 'a'.repeat(64) }, identity)).rejects.toMatchObject({ code: 'SKU_COUPON_STATE_CONFLICT' });
  });
  it('rejects stale impact without refunds', async () => {
    const f = fixture({ skuCoupons: { listActiveBySku: vi.fn(async () => [{ coupon_id: '5', account_id: '4', status: 'AVAILABLE', points_cost_snapshot: 20, _openid: 'openid-example' }]) } });
    await expect(f.admin.deleteSku({ sku_id: '1', impact_hash: 'a'.repeat(64) }, identity)).rejects.toMatchObject({ code: 'SKU_DEACTIVATION_IMPACT_CHANGED' });
    expect(f.events).toEqual([]);
  });
  it('refunds snapshot cost with account locks and immutable lifetime totals', async () => {
    const coupon = { coupon_id: '5', account_id: '4', status: 'AVAILABLE', points_cost_snapshot: 20, _openid: 'o123456789x' };
    const f = fixture({ skuCoupons: { listActiveBySku: vi.fn(async () => [coupon]) } });
    const preview = await f.admin.previewSkuDeactivation({ sku_id: '1', operation: 'DELETE' }, identity);
    expect(preview.affected_accounts).toEqual([{ account_id: '4', openid_masked: 'o123****789x', coupon_count: 1, refund_points: 20 }]);
    const result = await f.admin.deleteSku({ sku_id: '1', impact_hash: deactivationHash('1', 'DELETE', 0, [coupon]) }, identity);
    expect(result).toMatchObject({ refunded_points: 20, refunded_coupon_count: 1 });
    expect(f.daos.pointsAccounts.updateBalance).toHaveBeenCalledWith({ id: '4', balance: '70', totalEarned: '100', totalSpent: '50' });
    expect(f.daos.pointsLedger.insert).toHaveBeenCalledWith(expect.objectContaining({ points_delta: '20', source_type: 'POINTS_EXCHANGE_REFUND', event_key: 'POINTS_EXCHANGE_REFUND:5', source_ref: '5' }));
    expect(f.daos.skuCoupons.markRefunded).toHaveBeenCalledWith('5', 'SKU删除', expect.any(Date));
    expect(f.events).toEqual(['account', 'balance', 'ledger', 'coupon', 'remove']);
  });
  it('supplies one refund event time for every coupon in a deactivation', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-22T01:02:03.000Z');
    vi.setSystemTime(now);
    try {
      const coupons = ['5', '6'].map(coupon_id => ({ coupon_id, account_id: '4', status: 'AVAILABLE', points_cost_snapshot: 20, _openid: 'o123456789x' }));
      const refunds: unknown[][] = [];
      const f = fixture({ skuCoupons: { listActiveBySku: vi.fn(async () => coupons), markRefunded: vi.fn(async (...args: unknown[]) => { refunds.push(args); return 1; }) } });
      await f.admin.deleteSku({ sku_id: '1', impact_hash: deactivationHash('1', 'DELETE', 0, coupons) }, identity);
      expect(refunds).toEqual([['5', 'SKU删除', now], ['6', 'SKU删除', now]]);
      expect(refunds[0]?.[2]).toBe(refunds[1]?.[2]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('requires trusted wechat identity for DIY material data', async () => {
    const f = fixture();
    await expect(f.public.listDiyMaterials({ catalog_type: 'BEAD', category_id: null }, identity)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('returns signed URLs only for images selected from visible catalog data', async () => {
    const f = fixture({ categories: { list: vi.fn(async () => [{ id: '3', name: '珠子', sort_order: 1 }]) }, items: { list: vi.fn(async () => [{ id: '2', category_id: '3', name: '白水晶', is_on_sale: 0, images: ['cloud://env/catalog/parent.png'] }]) }, skus: { listByItemIds: vi.fn(async () => [{ ...sku, image_file_id: 'cloud://env/catalog/sku.png' }]) } });
    const resolve = vi.fn(async (ids: readonly string[]) => Object.fromEntries(ids.map(id => [id, 'https://signed.example/image'])));
    const service = new CatalogService(f.daos as unknown as CatalogDaos, new PageTokens('catalog-test-secret-at-least-32-characters'), () => {}, { resolve });
    const result = await service.listDiyMaterials({ catalog_type: 'BEAD', category_id: null }, { kind: 'wechat', openid: 'trusted' });
    expect(result.image_urls).toEqual({ 'cloud://env/catalog/sku.png': 'https://signed.example/image' });
    expect(resolve).toHaveBeenCalledWith(['cloud://env/catalog/sku.png']);
  });
  it('rejects points exchange outside BEAD and STANDARD duplicate combinations', async () => {
    const payload = { sku_id: null, item_id: '2', spec_values: {}, diameter_mm: null, image_file_id: null, price_cent: 10, is_on_sale: true, points_exchange_enabled: true, points_cost: 100, deactivation_impact_hash: null };
    const f = fixture({ items: { findById: vi.fn(async () => ({ id: '2', catalog_type: 'STANDARD', is_deleted: 0, spec_schema: { dimensions: [] } })) } });
    await expect(f.admin.saveSku(payload, identity)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    f.daos.skus.listByItemIds.mockResolvedValue([{ ...sku, id: '9', spec_signature: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' }] as never);
    await expect(f.admin.saveSku({ ...payload, points_exchange_enabled: false, points_cost: null }, identity)).rejects.toMatchObject({ code: 'SKU_SPEC_ALREADY_EXISTS' });
    expect(f.daos.skus.save).not.toHaveBeenCalled();
  });
  it('returns no invalid or off-sale STANDARD SKU and logs only data identifiers', async () => {
    const definition = { dimensions: [{ key: 'color', label: '颜色', options: [{ value: 'white', label: '白' }] }] };
    const f = fixture({ categories: { findById: vi.fn(async () => ({ id: '3', catalog_type: 'STANDARD', is_enabled: 1, is_deleted: 0 })) }, items: { findById: vi.fn(async () => ({ id: '2', category_id: '3', name: '手串', images: [], description: null, catalog_type: 'STANDARD', is_deleted: 0, is_on_sale: 1, spec_schema: definition })) }, skus: { listByItemIds: vi.fn(async () => [{ ...sku, id: '1', spec_values: { color: 'white' } }, { ...sku, id: '2', spec_values: { color: 'bad' } }, { ...sku, id: '3', spec_values: { color: 'white' }, is_on_sale: 0 }]) } });
    const log = vi.fn();
    const service = new CatalogService(f.daos as unknown as CatalogDaos, new PageTokens('catalog-test-secret-at-least-32-characters'), log);
    expect((await service.getStandardItemDetail({ item_id: '2' })).skus.map(row => row.sku_id)).toEqual(['1']);
    expect(log).toHaveBeenCalledWith({ code: 'INVALID_CATALOG_DATA', item_id: '2', sku_id: '2' });
    f.daos.skus.listByItemIds.mockResolvedValue([]);
    await expect(service.getStandardItemDetail({ item_id: '2' })).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' });
  });
  it('retains off-sale DIY materials for the grey state', async () => {
    const f = fixture({ categories: { list: vi.fn(async () => [{ id: '3', name: '珠子', sort_order: 1 }]) }, items: { list: vi.fn(async () => [{ id: '2', category_id: '3', name: '白水晶', is_on_sale: 0 }]) }, skus: { listByItemIds: vi.fn(async () => [{ ...sku, is_on_sale: 0, stock_total: 0 }]) } });
    const data = await f.public.listDiyMaterials({ catalog_type: 'BEAD', category_id: null }, { kind: 'wechat', openid: 'trusted' });
    expect(data.items[0]).toMatchObject({ is_on_sale: false, skus: [{ id: '1', is_on_sale: false, available_stock: 0 }] });
  });
  it('blocks category and item deletion until children are explicitly processed', async () => {
    const f = fixture({ items: { list: vi.fn(async () => [{ id: '2' }]) }, skus: { listByItemIds: vi.fn(async () => [{ ...sku, stock_reserved: 1 }]) } });
    await expect(f.admin.deleteCategory({ category_id: '3' }, identity)).rejects.toMatchObject({ code: 'SKU_HAS_PENDING_ORDERS' });
    await expect(f.admin.deleteItem({ item_id: '2' }, identity)).rejects.toMatchObject({ code: 'SKU_HAS_PENDING_ORDERS' });
    f.daos.skus.listByItemIds.mockResolvedValue([{ ...sku }] as never);
    await expect(f.admin.deleteItem({ item_id: '2' }, identity)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.daos.items.softDelete).not.toHaveBeenCalled();
    expect(f.daos.categories.softDelete).not.toHaveBeenCalled();
  });
  it('replays a completed SKU delete without another refund', async () => {
    const f = fixture({ skus: { findById: vi.fn(async () => ({ ...sku, is_deleted: 1 })) } });
    expect(await f.admin.deleteSku({ sku_id: '1', impact_hash: 'a'.repeat(64) }, identity)).toMatchObject({ idempotent_replay: true, refunded_points: 0 });
    expect(f.events).toEqual([]);
  });
  it('does not change a category type after historical items exist', async () => {
    const f = fixture({ items: { list: vi.fn(async () => []), hasAnyByCategory: vi.fn(async () => true) }, categories: { save: vi.fn(async () => '3') } });
    await expect(f.admin.saveCategory({ category_id: '3', catalog_type: 'STANDARD', name: '商品', sort_order: 1, is_enabled: true }, identity)).rejects.toMatchObject({ code: 'CATALOG_TYPE_CONFLICT' });
  });
  it.each([{}, '{}', [123], '[broken'])('reports malformed stored image arrays as catalog data errors: %j', async images => {
    const item = { id: '2', category_id: '3', catalog_type: 'STANDARD', name: '手串', description: null, images, spec_schema: { dimensions: [] }, is_deleted: 0, is_on_sale: 1, updated_at: '2026-10-21 00:00:00' };
    const f = fixture({ items: { findById: vi.fn(async () => item), list: vi.fn(async () => [item]) }, categories: { findById: vi.fn(async () => ({ id: '3', catalog_type: 'STANDARD', is_enabled: 1, is_deleted: 0 })) }, skus: { listByItemIds: vi.fn(async () => [{ ...sku, spec_values: {} }]) } });
    const log = vi.fn();
    const service = new CatalogService(f.daos as unknown as CatalogDaos, new PageTokens('catalog-test-secret-at-least-32-characters'), log);
    await expect(f.admin.getItem({ item_id: '2' }, identity)).rejects.toMatchObject({ code: 'INVALID_CATALOG_DATA' });
    await expect(service.getStandardItemDetail({ item_id: '2' })).rejects.toMatchObject({ code: 'INVALID_CATALOG_DATA' });
    await expect(service.listStandardItems({ category_id: '3', page_token: null, page_size: 20 })).rejects.toMatchObject({ code: 'INVALID_CATALOG_DATA' });
    expect(log.mock.calls).toEqual([[{ code: 'INVALID_CATALOG_DATA', item_id: '2' }], [{ code: 'INVALID_CATALOG_DATA', item_id: '2' }]]);
  });
  it('decodes nullable stored image arrays as empty in admin and public models', async () => {
    const item = { id: '2', category_id: '3', catalog_type: 'STANDARD', name: '手串', description: null, images: null, spec_schema: { dimensions: [] }, is_deleted: 0, is_on_sale: 1, updated_at: '2026-10-21 00:00:00' };
    const f = fixture({ items: { findById: vi.fn(async () => item), list: vi.fn(async () => [item]) }, categories: { findById: vi.fn(async () => ({ id: '3', catalog_type: 'STANDARD', is_enabled: 1, is_deleted: 0 })) }, skus: { listByItemIds: vi.fn(async () => [{ ...sku, spec_values: {} }]) } });
    expect((await f.admin.getItem({ item_id: '2' }, identity)).images).toEqual([]);
    expect((await f.public.getStandardItemDetail({ item_id: '2' })).images).toEqual([]);
    expect((await f.public.listStandardItems({ category_id: '3', page_token: null, page_size: 20 })).items[0]?.cover_file_id).toBeNull();
  });
});
