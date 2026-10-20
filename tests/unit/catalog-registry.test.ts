import { describe, expect, it, vi } from 'vitest';
import { createBusinessApi } from '../../cloudfunctions/business-api/src/app';
import { createActionRegistry } from '../../cloudfunctions/business-api/src/action-registry';
import type { CatalogServices } from '../../cloudfunctions/business-api/src/catalog-registry';
import type { SiteConfigService } from '../../packages/backend/src/services/site-config-service';
describe('catalog business-api registration', () => {
  function fixture() {
    const site = { getPublicSiteConfig: async () => ({ banners: [], customer_service: null, feature_entries: [] }) } as unknown as SiteConfigService;
    const categories = vi.fn(async () => ({ categories: [] })); const listAdmin = vi.fn(async () => ({ items: [], next_page_token: null }));
    const services = { catalogService: { listStandardCategories: categories }, adminCatalogService: { listCategories: listAdmin }, inventoryService: {} } as unknown as CatalogServices;
    return { site, services, categories, listAdmin };
  }
  it('registers named catalog capabilities and preserves the original actions', () => {
    const f = fixture(); const actions = createActionRegistry(f.site, f.services);
    expect([...actions.keys()]).toEqual(['getPublicSiteConfig', 'getSiteConfig', 'listAdminCategories', 'listAdminItems', 'getAdminCatalogItem', 'saveCategory', 'saveCatalogItem', 'saveCatalogSku', 'previewSkuDeactivation', 'deleteCategory', 'deleteCatalogItem', 'deleteCatalogSku', 'adjustInventory', 'listInventoryMovements', 'listStandardCategories', 'listStandardItems', 'getStandardItemDetail', 'listDiyMaterials']);
  });
  it('public catalog reads never require identity and admin handlers receive only resolved identity', async () => {
    const f = fixture(); const identity = vi.fn(async () => ({ kind: 'web' as const, uid: 'trusted' }));
    const api = createBusinessApi({ siteConfigService: f.site, catalogServices: f.services, resolveIdentity: identity, log() {} });
    expect(await api({ action: 'listStandardCategories', payload: {} }, {})).toMatchObject({ ok: true, data: { categories: [] } });
    expect(identity).not.toHaveBeenCalled();
    const payload = { catalog_type: null, page_token: null, page_size: 20 };
    expect(await api({ action: 'listAdminCategories', payload, uid: 'spoofed' }, { uid: 'spoofed' })).toMatchObject({ ok: true });
    expect(f.listAdmin).toHaveBeenCalledWith(payload, { kind: 'web', uid: 'trusted' });
  });
  it('rejects extra mutation fields before resolving identity', async () => {
    const f = fixture(); const identity = vi.fn(async () => ({ kind: 'anonymous' as const }));
    const api = createBusinessApi({ siteConfigService: f.site, catalogServices: f.services, resolveIdentity: identity, log() {} });
    expect(await api({ action: 'adjustInventory', payload: { operation_key: '1', sku_id: '1', stock_delta: 1, remark: '盘点', uid: 'spoofed' } }, {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(identity).not.toHaveBeenCalled();
  });
});
