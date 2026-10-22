import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import type { Cart } from '../../packages/contracts/src/cart';
import type { CheckoutQuote } from '../../packages/contracts/src/checkout';
import type { AddressBook } from '../../packages/contracts/src/address';
import type { DesignVersionDetail, DesignVersionPage } from '../../packages/contracts/src/design';
import type { DiyMaterials } from '../../packages/contracts/src/catalog';
import type { AvailableSkuCoupon, ExchangePointsResult, PointsCenter, PointsExchangePage } from '../../packages/contracts/src/points';

type Response = { data: unknown };
type Request = (action: string, payload: Record<string, unknown>) => Promise<Response>;
interface Data { [key: string]: unknown; items: { sku_id?: string; cart_item_id?: string; checked?: boolean }[]; selected: string[]; subtotalText: string; totalText: string; estimateText: string; quoteLoading: boolean; loading: boolean; error: string; quoteError: string; purchasable: boolean; detail: DesignVersionDetail | null; categories: { id: string; name: string }[]; category: string; balance: string; categoryError: string; listError: string }
interface MiniPage { data: Data; setData(patch: Partial<Data>): void; [key: string]: unknown }
function page(name: string, request: Request) {
  let instance: MiniPage;
  const patches: Partial<Data>[] = [];
  const open = vi.fn();
  function load(file: string): unknown { const module = { exports: {} }; runInNewContext(readFileSync(file, 'utf8'), { module, require: (path: string) => load(resolve(dirname(file), path + '.js')) }); return module.exports; }
  runInNewContext(readFileSync(`miniprogram/pages/${name}/index.js`, 'utf8'), {
    Page(value: MiniPage) { instance = value; instance.data = structuredClone(value.data); instance.setData = patch => { patches.push(structuredClone(patch)); Object.assign(instance.data, patch); }; },
    wx: { showToast: vi.fn(), showModal: (options: { success(result: { confirm: boolean }): void }) => options.success({ confirm: true }) },
    require(path: string) { if (path.endsWith('/api')) return { request }; if (path.endsWith('/navigation')) return { open, query: (route: string, params: Record<string, string>) => route + '?' + new URLSearchParams(params).toString() }; return load(resolve('miniprogram/pages', name, path + '.js')); },
  });
  return { open, patches, get data() { return instance.data; }, set(key: string, value: unknown) { instance[key] = value; }, call(method: string, ...args: unknown[]) { return (instance[method] as (...values: unknown[]) => unknown).apply(instance, args); } };
}
function deferred<T>() { let resolveValue: (value: T) => void = () => {}; let rejectValue: (error: Error) => void = () => {}; const promise = new Promise<T>((resolve, reject) => { resolveValue = resolve; rejectValue = reject; }); return { promise, resolve: resolveValue, reject: rejectValue }; }
const event = (dataset: Record<string, unknown>) => ({ currentTarget: { dataset } });
const cart: Cart = { items: ['c1', 'c2'].map(cart_item_id => ({ cart_item_id, item_type: 'DESIGN', sku_id: null, design_version_id: 'v1', quantity: 1, display: { name: '设计', spec_text: '8mm', image_file_id: null, current_unit_price_cent: 1000, version_no: 1 }, purchasable: true, unavailable_reason: null })) };
const addresses: AddressBook = { addresses: [{ address_id: 'a1', receiver_name: '张', phone: '13800000000', province_code: '440000', province: '广东省', city_code: '440300', city: '深圳市', district_code: '440305', district: '南山区', address_line: '街道1号', is_default: true }] };
const quote: CheckoutQuote = { quote_hash: 'q1', address: { address_id: 'a1', receiver_name: '张', phone_masked: '138****0000', full_address: '广东省深圳市' }, items: [{ source_type: 'DESIGN', source_id: 'v1', cart_item_id: 'c1', name: '设计', quantity: 1, image_file_id: null, gross_amount_cent: 1000, discount_amount_cent: 500, line_amount_cent: 500, purchasable: true, unavailable_reason: null, applied_sku_coupons: [{ sku_id: 's1', free_quantity: 1, unit_price_cent: 500, discount_amount_cent: 500 }] }], goods_amount_cent: 1000, discount_amount_cent: 500, shipping_fee_cent: 80, total_amount_cent: 580 };
const version: DesignVersionDetail = { design_id: 'd1', design_version_id: 'v1', version_no: 1, name: '手串', components: [{ sku_id: 's1', snapshot: { name: '保存珠子', diameter_mm: 8, image_file_id: null }, current: { name: '当前珠子', diameter_mm: 8, image_file_id: null }, changed: true, purchasable: true, unavailable_reason: null }] };
const versions: DesignVersionPage = { design_id: 'd1', current_version_no: 2, versions: [{ design_version_id: 'v1', version_no: 1, thumbnail_file_id: null, created_at: '2026-10-22T00:00:00Z' }, { design_version_id: 'v2', version_no: 2, thumbnail_file_id: null, created_at: '2026-10-22T00:01:00Z' }], next_page_token: null };
const beads: DiyMaterials = { categories: [{ id: 'b1', name: '来自后台的很长珠子分类名', sort_order: 1 }], items: [{ id: 'i1', category_id: 'b1', name: '珠子', is_on_sale: true, skus: [{ id: 's1', diameter_mm: 8, price_cent: 500, available_stock: 100, is_on_sale: true, image_file_id: null }] }] };
const accessories: DiyMaterials = { categories: [{ id: 'a1', name: '配件分类', sort_order: 1 }], items: [] };
const center: PointsCenter = { balance: '100', total_earned: '100', total_spent: '0', checked_in_today: true, recent_ledger: [] };
const list: PointsExchangePage = { items: [{ sku_id: 's1', item_name: '珠子', diameter_mm: 8, image_file_id: null, points_cost: 10, available_stock: 5 }], next_page_token: 'next' };
const exchanged: ExchangePointsResult = { coupon_id: 'cp1', sku_id: 's1', status: 'AVAILABLE', points_cost: 10, points_balance: '90', idempotent_replay: false };
function cartRequest(overrides: Partial<Record<string, () => Promise<Response>>> = {}): Request { return async action => { if (overrides[action]) return overrides[action](); if (action === 'getCart') return { data: cart }; if (action === 'listAddresses') return { data: addresses }; if (action === 'previewOrderFromCart') return { data: quote }; if (action === 'updateCartItem') return { data: { cart_item_id: 'c1', quantity: 2 } }; throw new Error('Unexpected ' + action); }; }
function designRequest(coupons: AvailableSkuCoupon[] = [{ sku_id: 's1', available_count: 1 }], overrides: Partial<Record<string, () => Promise<Response>>> = {}): Request { return async (action, payload) => { if (overrides[action]) return overrides[action](); if (action === 'getDesignVersion') return { data: { ...version, design_version_id: payload.design_version_id } }; if (action === 'listDesignVersions') return { data: versions }; if (action === 'listDiyMaterials') return { data: payload.catalog_type === 'BEAD' ? beads : accessories }; if (action === 'getMyAvailableSkuCoupons') return { data: { items: coupons } }; throw new Error('Unexpected ' + action); }; }

it('cart displays server discount/shipping/total with its default address, rather than local multiplication', async () => {
  const request = vi.fn(cartRequest()); const p = page('cart', request); await p.call('load'); await p.call('toggle', event({ id: 'c1' }));
  expect(request).toHaveBeenCalledWith('previewOrderFromCart', { cart_item_ids: ['c1'], address_id: 'a1' }); expect(p.data).toMatchObject({ subtotalText: '5.80', goodsText: '10.00', discountText: '5.00', shippingText: '0.80' });
});
it('cart uses the first address if no default and re-reads cart and addresses on return', async () => {
  const request = vi.fn(cartRequest({ listAddresses: async () => ({ data: { addresses: [{ ...addresses.addresses[0], is_default: false }] } }) })); const p = page('cart', request); await p.call('onShow'); await p.call('toggleAll'); await p.call('onShow');
  expect(request.mock.calls.filter(call => call[0] === 'getCart')).toHaveLength(2); expect(request.mock.calls.filter(call => call[0] === 'listAddresses')).toHaveLength(2); expect(request).toHaveBeenCalledWith('previewOrderFromCart', { cart_item_ids: ['c1', 'c2'], address_id: 'a1' });
});
it('cart with no address keeps an unknown total while allowing the existing checkout route', async () => {
  const request = vi.fn(cartRequest({ listAddresses: async () => ({ data: { addresses: [] } }) })); const p = page('cart', request); await p.call('load'); await p.call('toggle', event({ id: 'c1' })); await p.call('checkout');
  expect(p.data).toMatchObject({ subtotalText: '—', quoteHint: '结算时选择地址并核算' }); expect(request.mock.calls.filter(call => call[0] === 'previewOrderFromCart')).toHaveLength(0); expect(p.open).toHaveBeenCalledWith('/pages/checkout/index?cart_item_ids=c1');
});
it('cart immediately invalidates a selected quote and ignores older response and finally', async () => {
  const old = deferred<Response>(), next = deferred<Response>(); let calls = 0; const p = page('cart', cartRequest({ previewOrderFromCart: () => ++calls === 1 ? old.promise : next.promise })); await p.call('load');
  const first = p.call('toggle', event({ id: 'c1' })); const second = p.call('toggleAll'); expect(p.data.subtotalText).toBe('—');
  old.resolve({ data: quote }); await first; expect(p.data.quoteLoading).toBe(true); expect(p.data.subtotalText).toBe('—'); next.resolve({ data: { ...quote, total_amount_cent: 1080 } }); await second; expect(p.data).toMatchObject({ subtotalText: '10.80', quoteLoading: false });
});
it('cart clears quote before a quantity mutation and does not keep stale price on failure', async () => {
  const mutation = deferred<Response>(); const p = page('cart', cartRequest({ updateCartItem: () => mutation.promise })); await p.call('load'); await p.call('toggle', event({ id: 'c1' })); const updating = p.call('quantity', event({ index: 0, delta: 1 })); expect(p.data.subtotalText).toBe('—'); mutation.reject(new Error('修改失败')); await updating; expect(p.data.subtotalText).toBe('—'); expect(p.data.error).toBe('修改失败');
});
it.each(['pending', 'failure'])('cart return reads cannot restore a pre-mutation quote while quantity update is %s', async outcome => {
  const returnedCart = deferred<Response>(), returnedAddresses = deferred<Response>(), mutation = deferred<Response>(), staleQuote = deferred<Response>();
  let cartCalls = 0, addressCalls = 0, quoteCalls = 0;
  const request = vi.fn(cartRequest({
    getCart: async () => ++cartCalls === 1 ? { data: cart } : returnedCart.promise,
    listAddresses: async () => ++addressCalls === 1 ? { data: addresses } : returnedAddresses.promise,
    previewOrderFromCart: async () => ++quoteCalls === 1 ? { data: quote } : staleQuote.promise,
    updateCartItem: () => mutation.promise,
  }));
  const p = page('cart', request); await p.call('onShow'); await p.call('toggle', event({ id: 'c1' }));
  const reading = p.call('onShow'); const updating = p.call('quantity', event({ index: 0, delta: 1 }));
  returnedCart.resolve({ data: cart }); returnedAddresses.resolve({ data: addresses });
  await vi.waitFor(() => expect(p.data.submitting).toBe(true));
  if (outcome === 'failure') { mutation.reject(new Error('updatefailed')); await updating; }
  staleQuote.resolve({ data: { ...quote, total_amount_cent: 1080 } }); await reading;
  try {
    expect(p.data.subtotalText).toBe('—');
    expect(quoteCalls).toBe(1);
    expect(p.data.error).toBe(outcome === 'failure' ? 'updatefailed' : '');
  } finally { if (outcome === 'pending') { mutation.reject(new Error('updatefailed')); await updating; } }
});
it('cart does not start a return read in the middle of a mutation or restore a quote after failure', async () => {
  const mutation = deferred<Response>(); const request = vi.fn(cartRequest({ updateCartItem: () => mutation.promise })); const p = page('cart', request);
  await p.call('load'); await p.call('toggle', event({ id: 'c1' })); const updating = p.call('quantity', event({ index: 0, delta: 1 }));
  await p.call('onShow'); mutation.reject(new Error('updatefailed')); await updating;
  expect(request.mock.calls.filter(call => call[0] === 'getCart')).toHaveLength(1);
  expect(request.mock.calls.filter(call => call[0] === 'listAddresses')).toHaveLength(1);
  expect(p.data).toMatchObject({ subtotalText: '—', quoteLoading: false, loading: false, submitting: false, error: 'updatefailed' });
});
it('cart errors remain errors and unavailable products cannot be selected', async () => {
  const p = page('cart', cartRequest({ getCart: async () => ({ data: { items: [{ ...cart.items[0], purchasable: false }] } }), listAddresses: async () => { throw new Error('地址不可读'); } })); await p.call('load'); await p.call('toggleAll'); expect(p.data.selected).toEqual([]); expect(p.data.error).toContain('地址不可读');
  const broken = page('cart', cartRequest({ previewOrderFromCart: async () => { throw new Error('核算失败'); } })); await broken.call('load'); await broken.call('toggleAll'); expect(broken.data.subtotalText).toBe('—'); expect(broken.data.quoteError).toContain('核算失败');
});

it('design estimates with real DiyMaterials SKU ids and applies available SKU coupons only once across quantity', async () => {
  const request = vi.fn(designRequest()); const p = page('design', request); p.set('versionId', 'v1'); await p.call('load'); expect(p.data.estimateText).toBe('0.00'); await p.call('quantity', event({ delta: 1 })); expect(p.data.estimateText).toBe('5.00');
  expect(request).toHaveBeenCalledWith('listDiyMaterials', { catalog_type: 'BEAD', category_id: null }); expect(request).toHaveBeenCalledWith('listDiyMaterials', { catalog_type: 'ACCESSORY', category_id: null }); expect(request).toHaveBeenCalledWith('getMyAvailableSkuCoupons', {});
  await p.call('buy'); expect(p.open).toHaveBeenCalledWith('/pages/checkout/index?item_type=DESIGN&design_version_id=v1&quantity=2');
});
it('design return refresh removes a coupon now locked by another order', async () => {
  const coupons = [{ sku_id: 's1', available_count: 1 }]; const p = page('design', designRequest(coupons)); p.set('versionId', 'v1'); await p.call('onShow'); expect(p.data.estimateText).toBe('0.00'); coupons.splice(0); await p.call('onShow'); expect(p.data.estimateText).toBe('5.00');
});
it('design unknown current SKU price is not free and leaves editing/copy available', async () => {
  const p = page('design', designRequest([], { listDiyMaterials: async () => ({ data: { categories: [], items: [] } satisfies DiyMaterials }) })); p.set('versionId', 'v1'); await p.call('load'); expect(p.data).toMatchObject({ estimateText: '无法估算', purchasable: false }); await p.call('edit'); expect(p.open).toHaveBeenCalledWith('/pages/editor/index?design_version_id=v1');
});
it('design permits a newer version request and suppresses stale detail, estimate, history and finally', async () => {
  const old = deferred<Response>(), latest = deferred<Response>(); let calls = 0;
  const p = page('design', designRequest([], { getDesignVersion: () => ++calls === 1 ? old.promise : latest.promise })); p.set('versionId', 'v1'); const first = p.call('load'); const second = p.call('version', event({ id: 'v2' }));
  old.resolve({ data: version }); await first; expect(p.data.loading).toBe(true); expect(p.data.detail).toBeNull(); latest.resolve({ data: { ...version, design_version_id: 'v2', version_no: 2 } }); await second; expect(p.data.detail?.design_version_id).toBe('v2'); expect(p.data.estimateText).toBe('5.00');
});
it('failed design refresh invalidates old buying state but keeps the loaded design editable', async () => {
  let fail = false; const p = page('design', designRequest([], { getMyAvailableSkuCoupons: async () => { if (fail) throw new Error('券读取失败'); return { data: { items: [] } }; } })); p.set('versionId', 'v1'); await p.call('load'); fail = true; await p.call('load'); expect(p.data).toMatchObject({ estimateText: '无法估算', purchasable: false, error: '券读取失败' }); await p.call('buy'); expect(p.open).not.toHaveBeenCalled(); await p.call('edit'); expect(p.open).toHaveBeenCalled();
});
it('failed version detail refresh does not leave the previous version purchasable', async () => {
  let calls = 0; const p = page('design', designRequest([], { getDesignVersion: async () => { if (++calls > 1) throw new Error('版本不可读'); return { data: version }; } })); p.set('versionId', 'v1'); await p.call('load'); await p.call('version', event({ id: 'v2' })); expect(p.data).toMatchObject({ detail: null, purchasable: false, estimateText: '无法估算', error: '版本不可读' });
});

it('mall takes real BEAD categories and preserves the chosen category during pagination', async () => {
  const request = vi.fn(async (action: string): Promise<Response> => { if (action === 'getPointsCenter') return { data: center }; if (action === 'listDiyMaterials') return { data: beads }; if (action === 'listPointsExchangeSkus') return { data: list }; throw new Error(action); });
  const p = page('points-mall', request); await p.call('onLoad'); await p.call('onShow'); expect(p.data.categories).toEqual([{ id: '', name: '全部' }, ...beads.categories]); expect(Number(p.data.categoryWidth)).toBeGreaterThanOrEqual(Array.from(beads.categories[0]!.name).length * 28 + 50 + 64 + 88 + 16); expect(request).toHaveBeenCalledWith('listDiyMaterials', { catalog_type: 'BEAD', category_id: null });
  await p.call('chooseCategory', event({ id: 'b1' })); expect(request).toHaveBeenCalledWith('listPointsExchangeSkus', { category_id: 'b1', page_token: null, page_size: 20 }); await p.call('more'); expect(request).toHaveBeenLastCalledWith('listPointsExchangeSkus', { category_id: 'b1', page_token: 'next', page_size: 20 });
});
it('mall category switch clears stale rows and ignores old list responses and finally', async () => {
  const old = deferred<Response>(), latest = deferred<Response>(); let calls = 0;
  const p = page('points-mall', async action => { if (action === 'getPointsCenter') return { data: center }; if (action === 'listDiyMaterials') return { data: beads }; if (action === 'listPointsExchangeSkus') return ++calls === 1 ? old.promise : latest.promise; throw new Error(action); });
  await p.call('onLoad'); const first = p.call('onShow'); await vi.waitFor(() => expect(p.data.categories?.length).toBe(2)); const second = p.call('chooseCategory', event({ id: 'b1' })); expect(p.data.items).toEqual([]); old.resolve({ data: list }); await first; expect(p.data.loading).toBe(true); expect(p.data.items).toEqual([]); latest.resolve({ data: { items: [], next_page_token: null } satisfies PointsExchangePage }); await second; expect(p.data).toMatchObject({ category: 'b1', loading: false, items: [] });
});
it('mall category, balance and list errors remain independent', async () => {
  const p = page('points-mall', async action => { if (action === 'getPointsCenter') return { data: center }; if (action === 'listDiyMaterials') throw new Error('分类失败'); if (action === 'listPointsExchangeSkus') throw new Error('列表失败'); throw new Error(action); }); await p.call('onLoad'); await p.call('onShow'); expect(p.data).toMatchObject({ balance: '100', categoryError: '分类失败', listError: '列表失败' }); expect(p.data.categories).toEqual([{ id: '', name: '全部' }]);
});
it('mall delayed exchange cannot overwrite a newer return balance and requests one protected reconciliation', async () => {
  const exchange = deferred<Response>(); let balance = '100';
  const request = vi.fn(async (action: string): Promise<Response> => {
    if (action === 'getPointsCenter') return { data: { ...center, balance } };
    if (action === 'listDiyMaterials') return { data: beads };
    if (action === 'listPointsExchangeSkus') return { data: list };
    if (action === 'exchangePointsForSkuCoupon') return exchange.promise;
    throw new Error(action);
  });
  const p = page('points-mall', request); await p.call('onLoad'); await p.call('onShow');
  const exchanging = p.call('exchange', event({ id: 's1' })); await vi.waitFor(() => expect(request.mock.calls.filter(call => call[0] === 'exchangePointsForSkuCoupon')).toHaveLength(1));
  await p.call('onHide'); balance = '95'; await p.call('onShow'); expect(p.data.balance).toBe('95');
  exchange.resolve({ data: exchanged }); await exchanging;
  expect(p.data).toMatchObject({ balance: '95', submitting: false, error: '' });
  expect(p.patches.filter(patch => 'balance' in patch).map(patch => patch.balance)).not.toContain('90');
  expect(request.mock.calls.filter(call => call[0] === 'getPointsCenter')).toHaveLength(3);
});
it('mall reconciles a hidden delayed exchange on return without publishing its older balance', async () => {
  const exchange = deferred<Response>(); let balance = '100';
  const request = vi.fn(async (action: string): Promise<Response> => {
    if (action === 'getPointsCenter') return { data: { ...center, balance } };
    if (action === 'listDiyMaterials') return { data: beads };
    if (action === 'listPointsExchangeSkus') return { data: list };
    if (action === 'exchangePointsForSkuCoupon') return exchange.promise;
    throw new Error(action);
  });
  const p = page('points-mall', request); await p.call('onLoad'); await p.call('onShow');
  const exchanging = p.call('exchange', event({ id: 's1' })); await vi.waitFor(() => expect(request.mock.calls.filter(call => call[0] === 'exchangePointsForSkuCoupon')).toHaveLength(1));
  await p.call('onHide'); balance = '95'; exchange.resolve({ data: exchanged }); await exchanging;
  expect(request.mock.calls.filter(call => call[0] === 'getPointsCenter')).toHaveLength(1);
  await p.call('onShow'); expect(p.data.balance).toBe('95');
  expect(p.patches.filter(patch => 'balance' in patch).map(patch => patch.balance)).not.toContain('90');
  expect(request.mock.calls.filter(call => call[0] === 'getPointsCenter')).toHaveLength(2);
});
it('mall queues one exchange reconciliation behind an unresolved return read and invalidates that read', async () => {
  const exchange = deferred<Response>(), returnedCenter = deferred<Response>(); let centerCalls = 0;
  const request = vi.fn(async (action: string): Promise<Response> => {
    if (action === 'getPointsCenter') { centerCalls += 1; if (centerCalls === 2) return returnedCenter.promise; return { data: { ...center, balance: centerCalls === 1 ? '100' : '95' } }; }
    if (action === 'listDiyMaterials') return { data: beads };
    if (action === 'listPointsExchangeSkus') return { data: list };
    if (action === 'exchangePointsForSkuCoupon') return exchange.promise;
    throw new Error(action);
  });
  const p = page('points-mall', request); await p.call('onLoad'); await p.call('onShow');
  const exchanging = p.call('exchange', event({ id: 's1' })); await vi.waitFor(() => expect(request.mock.calls.filter(call => call[0] === 'exchangePointsForSkuCoupon')).toHaveLength(1));
  await p.call('onHide'); const returning = p.call('onShow'); await vi.waitFor(() => expect(centerCalls).toBe(2));
  exchange.resolve({ data: exchanged }); await exchanging; expect(centerCalls).toBe(2);
  returnedCenter.resolve({ data: { ...center, balance: '93' } }); await returning;
  expect(p.data).toMatchObject({ balance: '95', submitting: false, loading: false, error: '' });
  expect(p.patches.filter(patch => 'balance' in patch).map(patch => patch.balance)).not.toContain('90');
  expect(p.patches.filter(patch => 'balance' in patch).map(patch => patch.balance)).not.toContain('93');
  expect(centerCalls).toBe(3);
});

it.each(['success', 'failure'])('cart newest quote remains authoritative after an older quote ends with %s', async outcome => {
  const old = deferred<Response>(), latest = deferred<Response>(); let calls = 0; const p = page('cart', cartRequest({ previewOrderFromCart: () => ++calls === 1 ? old.promise : latest.promise })); await p.call('load'); const first = p.call('toggle', event({ id: 'c1' })); const second = p.call('toggleAll'); latest.resolve({ data: { ...quote, total_amount_cent: 1080 } }); await second; if (outcome === 'success') old.resolve({ data: quote }); else old.reject(new Error('过期核价失败')); await first; expect(p.data).toMatchObject({ subtotalText: '10.80', quoteLoading: false, quoteError: '' });
});
it('deselecting all cart rows keeps zero after its pending quote responds', async () => {
  const pending = deferred<Response>(); const p = page('cart', cartRequest({ previewOrderFromCart: () => pending.promise })); await p.call('load'); const loading = p.call('toggleAll'); await p.call('toggleAll'); pending.resolve({ data: quote }); await loading; expect(p.data).toMatchObject({ subtotalText: '0.00', quoteLoading: false, selected: [] });
});
it.each(['success', 'failure'])('design newest version and estimate survive older version %s arriving last', async outcome => {
  const old = deferred<Response>(); let calls = 0; const p = page('design', designRequest([], { getDesignVersion: async () => ++calls === 1 ? old.promise : { data: { ...version, design_version_id: 'v2', version_no: 2 } } })); p.set('versionId', 'v1'); const first = p.call('load'); await p.call('version', event({ id: 'v2' })); if (outcome === 'success') old.resolve({ data: version }); else old.reject(new Error('过期版本失败')); await first; expect(p.data).toMatchObject({ detail: { design_version_id: 'v2' }, estimateText: '5.00', purchasable: true, loading: false, error: '' });
});
it('design stale history does not overwrite a newer version history or loading state', async () => {
  const old = deferred<Response>(), latest = deferred<Response>(); let calls = 0; const p = page('design', designRequest([], { listDesignVersions: () => ++calls === 1 ? old.promise : latest.promise })); p.set('versionId', 'v1'); const first = p.call('load'); await vi.waitFor(() => expect(calls).toBe(1)); const second = p.call('version', event({ id: 'v2' })); await vi.waitFor(() => expect(calls).toBe(2)); old.reject(new Error('旧历史失败')); await first; expect(p.data).toMatchObject({ loading: true, versionsLoading: true, versionsError: '' }); latest.resolve({ data: { ...versions, current_version_no: 3 } }); await second; expect(p.data).toMatchObject({ currentVersion: 3, loading: false, versionsLoading: false });
});
it('design price overflow is unknown even for a fully available version', async () => {
  const oversized: DiyMaterials = { ...beads, items: [{ ...beads.items[0]!, skus: [{ ...beads.items[0]!.skus[0]!, price_cent: Number.MAX_SAFE_INTEGER }] }] }; const p = page('design', designRequest([], { listDiyMaterials: async () => ({ data: oversized }) })); p.set('versionId', 'v1'); await p.call('load'); await p.call('quantity', event({ delta: 1 })); expect(p.data).toMatchObject({ estimateText: '无法估算', purchasable: false });
});
