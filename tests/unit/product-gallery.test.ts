import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import type { StandardItemDetail } from '../../packages/contracts/src/catalog';

interface Slide { id: string; url: string; key: string }
interface GalleryData {
  item: StandardItemDetail | null;
  loading: boolean;
  error: string;
  selection: Record<string, string>;
  dimensions: {
    key: string; label: string;
    options: { value: string; label: string; selected: boolean; available: boolean }[];
  }[];
  sku: StandardItemDetail['skus'][number] | null;
  priceText: string;
  quantity: number;
  stockText: string;
  coverUrl: string;
  gallery: Slide[];
  galleryCurrent: number;
  galleryVersion: number;
  totalText: string;
  submitting: boolean;
  purchaseError: string;
}
interface PageEvent { currentTarget: { dataset: Record<string, unknown> } }
interface SwipeEvent extends PageEvent { detail: { current: number; source: 'touch' } }
interface GalleryPage {
  data: GalleryData;
  itemId: string;
  setData(patch: Partial<GalleryData>): void;
  load(): Promise<void>;
  galleryChange(event: SwipeEvent): void;
  quantityChange(event: PageEvent): void;
  chooseOption(event: PageEvent): void;
  previewImage(): void;
  coverError(event: PageEvent): void;
  addCart(): Promise<void>;
  buy(): void;
}
interface NativeInput {
  name: string;
  config: { env: string };
  data: {
    action: string;
    payload: { item_id: string } | { item_type: 'STANDARD'; sku_id: string; quantity: number };
  };
}
interface CommonJsModule { exports: unknown }

const detail: StandardItemDetail = {
  item_id: 'product1', name: '水晶消磁碗套装', description: '含水晶碗及碎石',
  images: ['main', 'side', 'main', 'alias', 'unsigned'],
  image_urls: { main: 'https://signed.example/main?token=1', side: 'https://signed.example/side?token=1', alias: 'https://signed.example/main?token=1', white: 'https://signed.example/white?token=1', clear: 'https://signed.example/clear?token=1' },
  spec_schema: { dimensions: [{ key: 'gravel', label: '碎石', options: [{ value: 'WHITE', label: '标准白水晶' }, { value: 'CLEAR', label: '高透白水晶' }] }] },
  skus: [
    { sku_id: 'sku-white', spec_values: { gravel: 'WHITE' }, price_cent: 3090, available_stock: 5, image_file_id: 'white' },
    { sku_id: 'sku-clear', spec_values: { gravel: 'CLEAR' }, price_cent: 4090, available_stock: 2, image_file_id: 'clear' },
  ],
};
const event = (dataset: Record<string, unknown>) => ({ currentTarget: { dataset } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function page(response: (action: string, payload: NativeInput['data']['payload']) => unknown = () => structuredClone(detail)) {
  let capturedPage: GalleryPage | undefined;
  const native = {
    previewImage: vi.fn(), showToast: vi.fn(), navigateTo: vi.fn(), switchTab: vi.fn(),
    cloud: { callFunction: vi.fn(async (input: NativeInput) => ({ result: { ok: true, code: 'OK', message: '', request_id: 'gallery-test', data: await response(input.data.action, input.data.payload) } })) },
  };
  const cache = new Map<string, CommonJsModule>();
  function load(file: string): unknown {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const module: CommonJsModule = { exports: {} }; cache.set(file, module);
    runInNewContext(readFileSync(file, 'utf8'), {
      module, wx: native,
      Page(value: unknown) {
        const registered = value as GalleryPage;
        capturedPage = registered;
        registered.data = structuredClone(registered.data);
        registered.setData = (patch: Partial<GalleryData>) => { Object.assign(registered.data, patch); };
      },
      require(path: string) { return load(resolve(dirname(file), path + '.js')); },
    }, { filename: file });
    return module.exports;
  }
  load(resolve('miniprogram/pages/product/index.js'));
  if (!capturedPage) throw new Error('Product Page did not register');
  const p = capturedPage;
  p.itemId = detail.item_id;
  return {
    p, native,
    swipe(current: number) { p.galleryChange({ ...event({ version: p.data.galleryVersion }), detail: { current, source: 'touch' } }); },
    imageEvent(index: number) {
      const image = p.data.gallery[index];
      if (!image) throw new Error(`Missing gallery slide at index ${index}`);
      return event({ version: p.data.galleryVersion, id: image.id, url: image.url });
    },
  };
}

describe('product image gallery with the native API boundary', () => {
  it('builds signed selected-SKU and item slides in stable deduplicated order', async () => {
    const t = page(); await t.p.load();
    expect(t.p.data.gallery.map(image => image.url)).toEqual([detail.image_urls!.white, detail.image_urls!.main, detail.image_urls!.side]);
    expect(t.p.data).toMatchObject({ galleryCurrent: 0, coverUrl: detail.image_urls!.white, sku: { sku_id: 'sku-white' } });
    expect(t.p.data.gallery.some(image => image.url.startsWith('cloud://'))).toBe(false);
  });

  it('previews the shown swipe and preserves that slide through quantity changes', async () => {
    const t = page(); await t.p.load(); t.swipe(2);
    const gallery = t.p.data.gallery; const version = t.p.data.galleryVersion;
    t.p.quantityChange(event({ delta: 1 }));
    expect(t.p.data).toMatchObject({ galleryCurrent: 2, coverUrl: detail.image_urls!.side, quantity: 2, totalText: '61.80', galleryVersion: version });
    expect(t.p.data.gallery).toBe(gallery);
    t.p.previewImage();
    expect(t.native.previewImage).toHaveBeenCalledWith({ current: detail.image_urls!.side, urls: gallery.map(image => image.url) });
    await t.p.addCart(); t.p.buy();
    expect(t.native.cloud.callFunction).toHaveBeenLastCalledWith(expect.objectContaining({ data: { action: 'addCartItem', payload: { item_type: 'STANDARD', sku_id: 'sku-white', quantity: 2 } } }));
    expect(t.native.navigateTo).toHaveBeenCalledWith({ url: '/pages/checkout/index?item_type=STANDARD&sku_id=sku-white&quantity=2' });
  });

  it('brings a changed SKU cover into view and ignores obsolete image errors', async () => {
    const t = page(); await t.p.load(); const obsolete = t.imageEvent(0); t.swipe(2);
    t.p.chooseOption(event({ key: 'gravel', value: 'CLEAR' }));
    expect(t.p.data).toMatchObject({ galleryCurrent: 0, coverUrl: detail.image_urls!.clear, priceText: '40.90', sku: { sku_id: 'sku-clear' } });
    const fresh = t.p.data.gallery;
    t.p.coverError(obsolete);
    expect(t.p.data.gallery).toBe(fresh);
    t.swipe(99); expect(t.p.data.galleryCurrent).toBe(0);
  });

  it('falls back from failed images without losing the currently shown surviving image', async () => {
    const t = page(); await t.p.load(); t.swipe(2);
    t.p.coverError(t.imageEvent(0));
    expect(t.p.data).toMatchObject({ galleryCurrent: 1, coverUrl: detail.image_urls!.side });
    expect(t.p.data.gallery.map(image => image.id)).toEqual(['main', 'side']);
    t.p.quantityChange(event({ delta: 1 })); expect(t.p.data.gallery).toHaveLength(2);
    t.p.coverError(t.imageEvent(1));
    expect(t.p.data).toMatchObject({ galleryCurrent: 0, coverUrl: detail.image_urls!.main });
    t.p.coverError(t.imageEvent(0));
    expect(t.p.data).toMatchObject({ gallery: [], galleryCurrent: 0, coverUrl: '' });
    t.p.previewImage(); expect(t.native.previewImage).not.toHaveBeenCalled();
  });

  it.each(['single', 'none'] as const)('handles %s image data without invented image URLs', async kind => {
    const data: StandardItemDetail = { ...structuredClone(detail), images: kind === 'single' ? ['main'] : ['unsigned'], image_urls: kind === 'single' ? { main: detail.image_urls!.main! } : {}, skus: detail.skus.map(sku => ({ ...sku, image_file_id: null })) };
    const t = page(() => data); await t.p.load();
    expect(t.p.data.gallery).toHaveLength(kind === 'single' ? 1 : 0);
    t.p.previewImage();
    if (kind === 'single') expect(t.native.previewImage).toHaveBeenCalledWith({ current: detail.image_urls!.main, urls: [detail.image_urls!.main] });
    else expect(t.native.previewImage).not.toHaveBeenCalled();
  });

  it('refreshes transient signed URLs and rejects old error and response events', async () => {
    const older = deferred<StandardItemDetail>(); let count = 0;
    const fresh = { ...structuredClone(detail), image_urls: Object.fromEntries(Object.entries(detail.image_urls!).map(([id, url]) => [id, url.replace('token=1', 'token=2')])) };
    const t = page(() => ++count === 1 ? structuredClone(detail) : count === 2 ? older.promise : fresh);
    await t.p.load(); const obsolete = t.imageEvent(0);
    const pending = t.p.load(); await t.p.load(); older.resolve(structuredClone(detail)); await pending;
    t.p.coverError(obsolete);
    expect(t.p.data.coverUrl).toBe(fresh.image_urls.white);
    expect(t.p.data.gallery.every(image => image.url.includes('token=2'))).toBe(true);
    expect(t.p.data.item?.image_urls?.white).toBe(fresh.image_urls.white);
  });

  it('keeps a latest load error authoritative and both purchase actions guarded', async () => {
    const older = deferred<StandardItemDetail>(); let count = 0;
    const t = page(() => { if (++count === 1) return structuredClone(detail); if (count === 2) return older.promise; throw new Error('offline'); });
    await t.p.load(); const obsolete = t.imageEvent(0); const pending = t.p.load();
    await t.p.load(); older.resolve(structuredClone(detail)); await pending; t.p.coverError(obsolete);
    const calls = t.native.cloud.callFunction.mock.calls.length;
    await t.p.addCart(); t.p.buy(); t.p.previewImage();
    expect(t.p.data).toMatchObject({ loading: false, error: '网络请求失败，请稍后重试', item: null, sku: null, gallery: [], coverUrl: '', totalText: '0.00' });
    expect(t.native.cloud.callFunction).toHaveBeenCalledTimes(calls);
    expect(t.native.navigateTo).not.toHaveBeenCalled(); expect(t.native.previewImage).not.toHaveBeenCalled();
  });
});

it('renders actual swiper slides with an indicator only when multiple images remain', () => {
  const source = readFileSync('miniprogram/pages/product/index.wxml', 'utf8');
  expect(source).toContain('<swiper');
  expect(source).toContain('current="{{galleryCurrent}}"');
  expect(source).toContain('indicator-dots="{{gallery.length > 1}}"');
  expect(source).toContain('bindchange="galleryChange"');
  expect(source).toContain('wx:for="{{gallery}}"');
  expect(source).toContain('data-version="{{galleryVersion}}"');
  expect(source).toContain('src="{{image.url}}"');
  expect(source).toContain('图片暂不可用');
  expect(source).toMatch(/class="detail-heading"[\s\S]*class="detail-name"[\s\S]*class="detail-type"/);
});
