import { describe, expect, it, vi } from 'vitest';
import type { CatalogDaos } from '../../packages/backend/src/catalog/dao';
import { CatalogService } from '../../packages/backend/src/services/catalog-service';
import { PageTokens, validateCatalogPayload } from '../../packages/backend/src/catalog/rules';
import { CategoryDAO } from '../../packages/backend/src/catalog/category-dao';
import type { DatabaseExecutor } from '../../packages/backend/src/db/database';

describe('reference-aligned catalog category landing and search', () => {
  it('returns sale-only category counts and signs the selected category covers', async () => {
    const listPublicSummaries = vi.fn(async () => [{ id: '3', name: '成品手串', sort_order: 1, item_count: '2', cover_file_id: 'cloud://env/catalog/test.png' }]);
    const resolve = vi.fn(async () => ({ 'cloud://env/catalog/test.png': 'https://signed.example/test.png' }));
    const service = new CatalogService({ categories: { listPublicSummaries } } as unknown as CatalogDaos, new PageTokens('test-secret-with-more-than-32-characters'), () => {}, { resolve });
    expect(await service.listStandardCategories()).toEqual({ categories: [{ id: '3', name: '成品手串', sort_order: 1, item_count: 2, cover_file_id: 'cloud://env/catalog/test.png' }], image_urls: { 'cloud://env/catalog/test.png': 'https://signed.example/test.png' } });
    expect(resolve).toHaveBeenCalledWith(['cloud://env/catalog/test.png']);
  });
  it('searches enabled public STANDARD items across categories and scopes paging to search', async () => {
    const list = vi.fn(async () => []);
    const findById = vi.fn();
    const service = new CatalogService({ categories: { findById }, items: { list } } as unknown as CatalogDaos, new PageTokens('test-secret-with-more-than-32-characters'), () => {});
    await service.listStandardItems({ category_id: null, name_keyword: '水晶', page_token: null, page_size: 20 });
    expect(list).toHaveBeenCalledWith({ categoryId: null, keyword: '水晶', onSale: true, publicStandard: true }, null, 21);
    expect(findById).not.toHaveBeenCalled();
    const token = new PageTokens('test-secret-with-more-than-32-characters').encode(JSON.stringify(['standardItems', null, '水晶']), { id: '5' });
    await expect(service.listStandardItems({ category_id: null, name_keyword: '玛瑙', page_token: token, page_size: 20 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
  it('accepts old category payloads and bounded optional search, but rejects spoofed fields', () => {
    const old = { category_id: '3', page_token: null, page_size: 20 };
    expect(() => validateCatalogPayload('listStandardItems', old)).not.toThrow();
    expect(() => validateCatalogPayload('listStandardItems', { ...old, category_id: null, name_keyword: '水晶' })).not.toThrow();
    expect(() => validateCatalogPayload('listStandardItems', { ...old, name_keyword: 'x'.repeat(161) })).toThrow();
    expect(() => validateCatalogPayload('listStandardItems', { ...old, uid: 'fake' })).toThrow();
  });
  it('aggregates visible category metadata without leaking disabled or removed catalog entries', async () => {
    const query = vi.fn(async (_sql: string, _params: readonly unknown[]) => []);
    await new CategoryDAO({ query } as unknown as DatabaseExecutor).listPublicSummaries();
    const sql = query.mock.calls[0]?.[0] as unknown as string;
    expect(sql).toContain("c.catalog_type='STANDARD'");
    expect(sql).toContain('c.is_enabled=1');
    expect(sql).toContain('i.is_on_sale=1');
    expect(sql).toContain('i.is_deleted=0');
    expect(sql).toContain('cover_file_id');
  });
});
