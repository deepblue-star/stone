import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import type { DiyMaterials } from '../../packages/contracts/src/catalog';
interface HomeData { loading: boolean; error: string; entryImages: Record<string, string>; banners: { image_file_id: string; url: string }[] }
interface HomePage { data: HomeData; setData(patch: Partial<HomeData>): void; [method: string]: unknown }
type Request = (action: string, payload: object) => Promise<{ data: unknown }>;
const publicConfig = { banners: [{ image_file_id: 'banner', link_type: 'NONE', link_value: '', sort_order: 0 }], image_urls: { banner: 'https://assets.test/banner' }, customer_service: null, feature_entries: [{ key: 'DIY', enabled: true }, { key: 'STANDARD', enabled: false }] };
const materials: DiyMaterials = { categories: [{ id: '1', name: '珠子', sort_order: 0 }], items: [
  { id: '1', category_id: '1', name: '下架珠子', is_on_sale: false, skus: [{ id: '1', diameter_mm: 8, price_cent: 300, available_stock: 10, is_on_sale: true, image_file_id: 'off' }] },
  { id: '2', category_id: '1', name: '白水晶', is_on_sale: true, skus: [{ id: '2', diameter_mm: 8, price_cent: 300, available_stock: 10, is_on_sale: true, image_file_id: 'bead' }] },
], image_urls: { off: 'https://assets.test/off', bead: 'https://assets.test/bead' } };
const categories = { categories: [{ id: '1', name: '无图分类', sort_order: 0, cover_file_id: null }, { id: '2', name: '手串', sort_order: 1, cover_file_id: 'product' }], image_urls: { product: 'https://assets.test/product' } };
function home(request: Request, getTempFileURL = vi.fn(async () => ({ fileList: [] }))) {
  let page: HomePage;
  const open = vi.fn(), toast = vi.fn(), updates = vi.fn();
  runInNewContext(readFileSync('miniprogram/pages/home/index.js', 'utf8'), {
    Page(value: HomePage) { page = value; page.data = structuredClone(value.data); page.setData = patch => { updates(patch); Object.assign(page.data, patch); }; },
    require(path: string) { if (path.endsWith('/api')) return { request }; if (path.endsWith('/navigation')) return { open }; throw new Error(path); },
    wx: { showToast: toast, cloud: { getTempFileURL } },
  });
  return { data: page!.data, open, toast, updates, call(method: string, ...args: unknown[]) { return (page[method] as (...values: unknown[]) => unknown).apply(page, args); } };
}
const answer: Request = async action => ({ data: action === 'getPublicSiteConfig' ? publicConfig : action === 'listDiyMaterials' ? materials : categories });
const event = (key: string, url?: string) => ({ currentTarget: { dataset: { key, url } } });

it('shows real image-based DIY and STANDARD entries below the configured Banner', async () => {
  const request = vi.fn(answer), p = home(request); await p.call('load');
  expect(request).toHaveBeenCalledWith('listDiyMaterials', { catalog_type: 'BEAD', category_id: null });
  expect(request).toHaveBeenCalledWith('listStandardCategories', {});
  expect(p.data.entryImages).toEqual({ DIY: 'https://assets.test/bead', STANDARD: 'https://assets.test/product' });
  expect(p.data.banners[0]?.url).toBe('https://assets.test/banner');
  p.call('enter', event('DIY')); expect(p.open).toHaveBeenCalledWith('/pages/diy/index');
  p.call('enter', event('STANDARD')); expect(p.open).toHaveBeenCalledTimes(1); expect(p.toast).toHaveBeenCalledWith({ title: '即将上线', icon: 'none' });
  const markup = readFileSync('miniprogram/pages/home/index.wxml', 'utf8');
  expect(markup).toContain('entryImages.DIY'); expect(markup).toContain('entryImages.STANDARD');
  expect(markup).not.toContain('entry-symbol'); expect(markup).not.toContain('>○<'); expect(markup).not.toContain('>◇<');
});

it('keeps configuration and the other entry usable when one thumbnail source fails', async () => {
  const p = home(async (action, payload) => { if (action === 'listDiyMaterials') throw new Error('材料读取失败'); return answer(action, payload); });
  await p.call('load');
  expect(p.data).toMatchObject({ loading: false, error: '', entryImages: { DIY: '', STANDARD: 'https://assets.test/product' } });
  expect(p.data.banners).toHaveLength(1); p.call('enter', event('DIY')); expect(p.open).toHaveBeenCalledWith('/pages/diy/index');
});

it('ignores late image-error events for an older signed URL but clears an actual failed image', async () => {
  const p = home(answer); await p.call('load');
  p.call('entryImageError', event('DIY', 'https://assets.test/expired')); expect(p.data.entryImages.DIY).toBe('https://assets.test/bead');
  p.call('entryImageError', event('DIY', 'https://assets.test/bead')); expect(p.data.entryImages.DIY).toBe('');
  expect(p.data.entryImages.STANDARD).toBe('https://assets.test/product');
});

it('does not apply any in-flight configuration or image response after leaving the page', async () => {
  const finish: (() => void)[] = [];
  const p = home(async (action, payload) => { await new Promise<void>(resolve => finish.push(resolve)); return answer(action, payload); });
  const pending = p.call('load'); p.call('onUnload'); p.updates.mockClear(); finish.forEach(done => done()); await pending;
  expect(p.updates).not.toHaveBeenCalled();
});

it('refreshes configuration and image sources on returning to the homepage', async () => {
  const request = vi.fn(answer), p = home(request); await p.call('load'); await p.call('onShow');
  expect(request.mock.calls.filter(([action]) => action === 'getPublicSiteConfig')).toHaveLength(2);
});

it('retains valid feature switches and customer information if optional image URL lookup fails', async () => {
  const { image_urls: _images, ...config } = publicConfig;
  const customer = { wechat_id: 'demo-support', qr_file_id: 'qr' };
  const request: Request = async (action, payload) => action === 'getPublicSiteConfig' ? { data: { ...config, customer_service: customer } } : answer(action, payload);
  const p = home(request, vi.fn(async () => { throw new Error('图片地址解析失败'); }));
  await p.call('load');
  expect(p.data).toMatchObject({ error: '', customer, entries: config.feature_entries, banners: [{ image_file_id: 'banner', url: '' }], bannerError: '首页图片暂不可用' });
  p.call('enter', event('STANDARD')); expect(p.open).not.toHaveBeenCalled(); expect(p.toast).toHaveBeenCalledWith({ title: '即将上线', icon: 'none' });
});

it('starts a fresh read after leaving and returning while an older visit is still pending', async () => {
  let release = () => {}; let configReads = 0;
  const request: Request = async (action, payload) => {
    if (action !== 'getPublicSiteConfig') return answer(action, payload);
    if (++configReads === 1) { await new Promise<void>(resolve => { release = resolve; }); return { data: { ...publicConfig, feature_entries: [{ key: 'STANDARD', enabled: true }] } }; }
    return { data: publicConfig };
  };
  const p = home(request), oldVisit = p.call('load'); p.call('onHide'); await p.call('onShow');
  expect(configReads).toBe(2);
  release(); await oldVisit;
  expect(p.data).toMatchObject({ loading: false, entries: publicConfig.feature_entries });
  p.call('enter', event('STANDARD')); expect(p.open).not.toHaveBeenCalled();
});
