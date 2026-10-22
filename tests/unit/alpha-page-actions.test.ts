import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

interface MiniPage { data: Record<string, unknown>; setData(value: Record<string, unknown>): void; [key: string]: unknown }
function page(name: string, invoke: (action: string, payload: object) => Promise<unknown>) {
  let value: MiniPage;
  const open = vi.fn();
  const clipboard = vi.fn();
  runInNewContext(readFileSync(`miniprogram/pages/${name}/index.js`, 'utf8'), {
    Page(config: MiniPage) { value = config; value.data = structuredClone(config.data); value.setData = patch => Object.assign(value.data, patch); },
    require(path: string) {
      if (path.endsWith('/api')) return { request: invoke };
      if (path.endsWith('/navigation')) return { open, query: (route: string, params: Record<string, string>) => route + '?' + new URLSearchParams(params).toString() };
      if (path.endsWith('/design-model')) { const module = { exports: {} }; runInNewContext(readFileSync('miniprogram/services/design-model.js', 'utf8'), { module }); return module.exports; }
      if (path.endsWith('/format')) { const module = { exports: {} }; runInNewContext(readFileSync('miniprogram/services/format.js', 'utf8'), { module }); return module.exports; }
      throw new Error('Unexpected dependency ' + path);
    },
    wx: { setClipboardData: clipboard, showToast: vi.fn(), showModal: (options: {success: (result: {confirm: boolean}) => void}) => options.success({ confirm: true }), getStorageSync: () => '', setStorageSync: vi.fn(), removeStorageSync: vi.fn() },
  });
  return { instance: value!, open, clipboard, call: (method: string, ...args: unknown[]) => (value[method] as (...values: unknown[]) => unknown).apply(value, args) };
}

it('uses real category DTO counts/covers and navigates through a separate list', async () => {
  const invoke = vi.fn(async () => ({ data: { categories: [{ id: '3', name: '手串', item_count: 2, cover_file_id: 'cloud://env/a' }], image_urls: { 'cloud://env/a': 'https://signed.example/a' } } }));
  const p = page('catalog', invoke);
  await p.call('load');
  expect(invoke).toHaveBeenCalledWith('listStandardCategories', {});
  expect(p.instance.data.categories).toEqual([{ id: '3', name: '手串', item_count: 2, cover_file_id: 'cloud://env/a', coverUrl: 'https://signed.example/a' }]);
  p.call('openCategory', { currentTarget: { dataset: { index: 0 } } });
  expect(p.open).toHaveBeenCalledWith(expect.stringContaining('/pages/products/index?category_id=3'));
  p.call('input', { detail: { value: ' 白水晶 ' } }); p.call('search');
  expect(p.open).toHaveBeenLastCalledWith(expect.stringContaining('keyword='));
});

it('restores retry state after network failure and prevents duplicate loads', async () => {
  const invoke = vi.fn(async () => { throw new Error('网络失败'); });
  const p = page('catalog', invoke);
  p.instance.data.loading = true; await p.call('load'); expect(invoke).not.toHaveBeenCalled();
  p.instance.data.loading = false; await p.call('load');
  expect(p.instance.data).toMatchObject({ loading: false, error: '网络失败' });
});

it('copies the non-null invite code from the fixed nested profile contract', async () => {
  const p = page('profile', async () => ({ data: { points: { balance: '0', invite_code: 'A7K2' }, sku_coupons: { available_count: 0 } } }));
  await p.call('load'); p.call('copy');
  expect(p.clipboard).toHaveBeenCalledWith({ data: 'A7K2' });
});

it('signs in once and refreshes the actual points balance', async () => {
  const invoke = vi.fn(async (action: string) => ({ data: action === 'dailyCheckIn' ? { awarded_points: 5, balance: '5' } : { balance: '5', checked_in_today: true, recent_ledger: [] } }));
  const p = page('points', invoke);
  await p.call('checkIn');
  expect(invoke).toHaveBeenCalledWith('dailyCheckIn', {});
  expect(p.instance.data).toMatchObject({ submitting: false, center: { balance: '5', checked_in_today: true } });
  await p.call('checkIn');
  expect(invoke.mock.calls.filter(call => call[0] === 'dailyCheckIn')).toHaveLength(1);
});

it('binds only four-character code and correct manual channel without sending identities', async () => {
  const invoke = vi.fn(async (action: string) => ({ data: action === 'getMyInviteInfo' ? { invite_code: 'A7K2', bound_referrer: true, share_path: '/pages/home/index?ref=A7K2' } : { bound: true } }));
  const p = page('invite', invoke);
  p.instance.data.code = 'B9M2'; await p.call('bind');
  expect(invoke).toHaveBeenCalledWith('bindReferrer', { invite_code: 'B9M2', bind_channel: 'MANUAL_CODE' });
  expect(p.instance.data).toMatchObject({ submitting: false, info: { bound_referrer: true } });
});

it('saves only the ordered SKU references, never client price/free/snapshot fields', async () => {
  const invoke = vi.fn(async () => ({ data: { design_id: '5', design_version_id: '8', version_no: 1 } }));
  const p = page('editor', invoke);
  p.instance.data.components = [{ sku_id: '1', is_free: true, price_cent: 0 }, { sku_id: '2', snapshot: { name: 'fake' } }];
  await p.call('save');
  expect(invoke).toHaveBeenCalledWith('saveDesign', { design_id: null, name: '我的手串', components: [{ sku_id: '1' }, { sku_id: '2' }] });
  expect(p.instance.data).toMatchObject({ submitting: false, designId: '5', versionId: '8' });
});
