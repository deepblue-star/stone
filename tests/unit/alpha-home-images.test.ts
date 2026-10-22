import { expect, it, vi } from 'vitest';
import { SiteConfigService } from '../../packages/backend/src/services/site-config-service';
import type { SiteConfigDAO } from '../../packages/backend/src/dao/site-config-dao';
import type { AdminAccessService } from '../../packages/backend/src/services/admin-access-service';

it('signs only public homepage and customer images selected from stored configuration', async () => {
  const resolve = vi.fn(async () => ({ 'cloud://env/catalog/banner.png': 'https://signed.example/banner' }));
  const dao = { findByKeys: vi.fn(async () => [
    { config_key: 'home_banners', config_value: [{ image_file_id: 'cloud://env/catalog/banner.png', link_type: 'NONE', link_value: '', sort_order: 0 }] },
    { config_key: 'payment_rules', config_value: { secret_file: 'cloud://env/private/secret' } },
  ]) } as unknown as SiteConfigDAO;
  const service = new SiteConfigService(dao, {} as AdminAccessService, { resolve });
  expect(await service.getPublicSiteConfig()).toMatchObject({ image_urls: { 'cloud://env/catalog/banner.png': 'https://signed.example/banner' } });
  expect(resolve).toHaveBeenCalledWith(['cloud://env/catalog/banner.png']);
});

it('returns only enabled province code/name fields in shipping-rule order', async () => {
  const dao = { findByKey: vi.fn(async () => ({ config_value: { regions: [
    { province_code: '440000', province_name: '广东省', enabled: true, sort_order: 20, shipping_fee_cent: 800 },
    { province_code: '310000', province_name: '上海市', enabled: true, sort_order: 10, shipping_fee_cent: 600 },
    { province_code: '650000', province_name: '新疆维吾尔自治区', enabled: false, sort_order: 30, shipping_fee_cent: 1800 },
  ] } })) } as unknown as SiteConfigDAO;
  expect(await new SiteConfigService(dao, {} as AdminAccessService).getShippingRegions()).toEqual({ regions: [{ province_code: '310000', province_name: '上海市' }, { province_code: '440000', province_name: '广东省' }] });
});
