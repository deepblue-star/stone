import { describe, expect, it } from 'vitest';
import { normalizeSpec, validateCatalogPayload, deactivationHash, inventoryTotal, PageTokens } from '../../packages/backend/src/catalog/rules';

const schema = { dimensions: [{ key: 'color', label: '颜色', options: [{ value: 'white', label: '白' }] }, { key: 'size', label: '大小', options: [{ value: '8', label: '8mm' }] }] };
describe('catalog contracts and invariants', () => {
  it('rejects array-valued catalog_type instead of coercing it into an enum', () => {
    expect(() => validateCatalogPayload('listAdminCategories', { catalog_type: ['BEAD'], page_token: null, page_size: 20 })).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(() => validateCatalogPayload('saveCategory', { category_id: null, catalog_type: ['BEAD'], name: '珠子', sort_order: 0, is_enabled: true })).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(validateCatalogPayload('listAdminCategories', { catalog_type: null, page_token: null, page_size: 20 })).toMatchObject({ catalog_type: null });
  });
  it('normalizes standard values in schema order and hashes the canonical JSON', () => {
    const a = normalizeSpec(schema, { size: '8', color: 'white' });
    expect(JSON.stringify(a.values)).toBe('{"color":"white","size":"8"}');
    expect(a).toEqual(normalizeSpec(schema, { color: 'white', size: '8' }));
    expect(a.signature).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects missing, extra and undefined values and duplicate schema keys/options', () => {
    for (const values of [{ color: 'white' }, { color: 'white', size: '9' }, { color: 'white', size: '8', extra: 'x' }]) expect(() => normalizeSpec(schema, values)).toThrow();
    expect(() => normalizeSpec({ dimensions: [schema.dimensions[0], schema.dimensions[0]] }, {})).toThrow();
  });
  it('requires every SKU editable field and rejects unsafe money and stock injection', () => {
    const valid = { sku_id: null, item_id: '1', spec_values: null, diameter_mm: 8, image_file_id: 'cloud://env/image.png', price_cent: 100, is_on_sale: true, points_exchange_enabled: false, points_cost: null, deactivation_impact_hash: null };
    expect(validateCatalogPayload('saveCatalogSku', valid)).toEqual(valid);
    const { points_cost: _, ...missing } = valid;
    expect(() => validateCatalogPayload('saveCatalogSku', missing)).toThrow();
    expect(() => validateCatalogPayload('saveCatalogSku', { ...valid, price_cent: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    expect(() => validateCatalogPayload('saveCatalogSku', { ...valid, stock_total: 50 })).toThrow();
    expect(() => validateCatalogPayload('saveCatalogSku', { ...valid, is_on_sale: 1 })).toThrow();
  });
  it('hashes coupon snapshots sorted by numeric id and binds operation', () => {
    const coupons = [{ coupon_id: '10', account_id: '2', points_cost_snapshot: 20 }, { coupon_id: '2', account_id: '1', points_cost_snapshot: 10 }];
    expect(deactivationHash('1', 'DELETE', 0, coupons)).toBe(deactivationHash('1', 'DELETE', 0, [...coupons].reverse()));
    expect(deactivationHash('1', 'DELETE', 0, coupons)).not.toBe(deactivationHash('1', 'OFF_SALE', 0, coupons));
  });
  it('rejects lowering stock below reservations and integer overflow', () => {
    expect(inventoryTotal(10, 3, -7)).toBe(3);
    expect(() => inventoryTotal(10, 3, -8)).toThrow();
    expect(() => inventoryTotal(4294967295, 0, 1)).toThrow();
  });
  it('authenticates cursors and binds them to identity and filters', () => {
    const tokens = new PageTokens('test-secret-at-least-32-characters');
    const token = tokens.encode('admin:u:categories:BEAD', { id: '9', sort: 3 });
    expect(tokens.decode(token, 'admin:u:categories:BEAD')).toEqual({ id: '9', sort: 3 });
    expect(() => tokens.decode(token, 'admin:v:categories:BEAD')).toThrow();
    expect(() => tokens.decode(token.slice(0, -1) + 'X', 'admin:u:categories:BEAD')).toThrow();
  });
});
