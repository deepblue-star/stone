import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import type { ExchangePointsResult, PointsCenter, PointsExchangeSku, PointsLedgerEntry } from '../../packages/contracts/src/points';
import type { DiyMaterials, StandardItemDetail } from '../../packages/contracts/src/catalog';

interface MiniPage { data: Record<string, unknown>; setData(patch: Record<string, unknown>): void; [key: string]: unknown }
type Request = (action: string, payload: Record<string, unknown>) => Promise<unknown>;
function page<T extends Record<string, unknown>>(name: string, request: Request) {
  let instance: MiniPage;
  const open = vi.fn();
  function load(file: string): unknown {
    const module = { exports: {} };
    runInNewContext(readFileSync(file, 'utf8'), { module, require: (path: string) => load(resolve(dirname(file), path + '.js')) });
    return module.exports;
  }
  runInNewContext(readFileSync(`miniprogram/pages/${name}/index.js`, 'utf8'), {
    Page(value: MiniPage) { instance = value; instance.data = structuredClone(value.data); instance.setData = patch => Object.assign(instance.data, patch); },
    wx: { showToast: vi.fn(), showModal: (options: { success(result: { confirm: boolean }): void }) => options.success({ confirm: true }) },
    require(path: string) {
      if (path.endsWith('/api')) return { request };
      if (path.endsWith('/navigation')) return { open, query: (route: string, params: Record<string, string>) => route + '?' + new URLSearchParams(params).toString() };
      return load(resolve('miniprogram/pages', name, path + '.js'));
    },
  });
  return { open, data: instance!.data as T, call: (method: string, ...args: unknown[]) => {
    expect(typeof instance[method], `${name}.${method}`).toBe('function');
    return (instance[method] as (...values: unknown[]) => unknown).apply(instance, args);
  } };
}
const event = (dataset: Record<string, unknown>) => ({ currentTarget: { dataset } });
function deferred<T>() {
  let resolveValue: (value: T) => void = () => {};
  let rejectValue: (error: Error) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => { resolveValue = resolve; rejectValue = reject; });
  return { promise, resolve: resolveValue, reject: rejectValue };
}
const exchangeSku = { sku_id: '1', item_name: '珠子', points_cost: 10, diameter_mm: 8, image_file_id: null, available_stock: 10 } satisfies PointsExchangeSku;
const exchanged = { coupon_id: 'coupon1', sku_id: '1', status: 'AVAILABLE', points_cost: 10, points_balance: '90', idempotent_replay: false } satisfies ExchangePointsResult;
const ledger: PointsLedgerEntry[] = [
  { points_delta: '9007199254740993', balance_after: '9007199254740993', created_at: '2026-10-21T18:02:03.000Z', source_type: 'DAILY_CHECK_IN', description: '签到' },
  { points_delta: '-9007199254740993', balance_after: '0', created_at: '2026-10-22T01:00:00Z', source_type: 'POINTS_EXCHANGE', description: '兑换' },
];
const center: PointsCenter = { balance: '9007199254740993', checked_in_today: true, total_earned: '9007199254740993', total_spent: '0', recent_ledger: ledger };
const mallCategories: DiyMaterials = { categories: [{ id: 'beads', name: '后台珠子分类', sort_order: 1 }], items: [] };
type LedgerRow = PointsLedgerEntry & { timeText: string; pointsText: string };

it('retains all six order states and sends the selected server filter for each', async () => {
  const request = vi.fn(async () => ({ data: { orders: [], next_page_token: null } }));
  const p = page<{ filters: { name: string; status: string }[] }>('orders', request);
  await p.call('onLoad', {});
  expect(p.data.filters.map(filter => filter.name)).toEqual(['全部', '待付款', '待发货', '已发货', '已完成', '已关闭']);
  expect(p.data.filters.map(filter => filter.status)).toEqual(['', 'PENDING_PAYMENT', 'READY_TO_SHIP', 'SHIPPED', 'COMPLETED', 'CLOSED']);
  for (const filter of p.data.filters) {
    await p.call('filter', event({ status: filter.status }));
    expect(request).toHaveBeenLastCalledWith('listMyOrders', { status: filter.status || null, page_token: null, page_size: 20 });
  }
});

describe('safe product route text', () => {
  it.each([
    ['%E7%99%BD%E6%B0%B4%E6%99%B6', '白水晶'], ['白水晶', '白水晶'],
    ['100%天然', '100%天然'], ['%E7%99', '%E7%99'], ['%25E7%2599%25BD', '%E7%99%BD'],
  ])('decodes name/keyword once without decoding category IDs: %s', async (input, expected) => {
    const request = vi.fn(async () => ({ data: { items: [], next_page_token: null } }));
    const p = page<{ title: string; keyword: string; loading: boolean }>('products', request);
    await p.call('onLoad', { name: input, keyword: input, category_id: '%31' });
    expect(p.data).toMatchObject({ title: expected, keyword: expected });
    expect(request).toHaveBeenCalledWith('listStandardItems', { category_id: '%31', name_keyword: expected, page_token: null, page_size: 20 });
  });
});

it('uses a real detail DTO across option/quantity changes, cart and direct checkout', async () => {
  const detail = {
    item_id: '2', name: '手串', description: null, images: [], image_urls: {},
    spec_schema: { dimensions: [{ key: 'size', label: '珠径', options: [{ value: '8', label: '8 mm' }, { value: '10', label: '10 mm' }] }] },
    skus: [{ sku_id: '11', spec_values: { size: '8' }, price_cent: 12800, available_stock: 2, image_file_id: null }, { sku_id: '12', spec_values: { size: '10' }, price_cent: 16000, available_stock: 1, image_file_id: null }],
  } satisfies StandardItemDetail;
  const request = vi.fn(async (action: string) => ({ data: action === 'getStandardItemDetail' ? detail : { cart_item_id: 'cart1' } }));
  const p = page<{ loading: boolean; totalText: string; quantity: number; sku: StandardItemDetail['skus'][number] | null }>('product', request);
  await p.call('onLoad', { id: '2' });
  await vi.waitFor(() => expect(p.data.loading).toBe(false));
  await p.call('quantityChange', event({ delta: 1 }));
  expect(p.data).toMatchObject({ quantity: 2, totalText: '256.00' });
  await p.call('addCart');
  expect(request).toHaveBeenLastCalledWith('addCartItem', { item_type: 'STANDARD', sku_id: '11', quantity: 2 });
  await p.call('buy');
  expect(p.open).toHaveBeenLastCalledWith('/pages/checkout/index?item_type=STANDARD&sku_id=11&quantity=2');
  await p.call('chooseOption', event({ key: 'size', value: '10' }));
  expect(p.data).toMatchObject({ quantity: 1, totalText: '160.00', sku: { sku_id: '12' } });
  await p.call('chooseOption', event({ key: 'size', value: '10' }));
  p.open.mockClear(); request.mockClear();
  await p.call('addCart'); await p.call('buy');
  expect(request).not.toHaveBeenCalled(); expect(p.open).not.toHaveBeenCalled();
});
it('clears every purchase-derived value and blocks both actions after a successful detail refresh fails', async () => {
  const detail = { item_id: 'p1', name: '手串', description: null, images: ['photo'], image_urls: { photo: 'https://example/image' }, spec_schema: { dimensions: [] }, skus: [{ sku_id: 's1', available_stock: 9, spec_values: {}, price_cent: 100, image_file_id: null }] } satisfies StandardItemDetail;
  const refresh = deferred<{ data: StandardItemDetail }>(); let detailCalls = 0;
  const request = vi.fn(async (action: string) => action === 'getStandardItemDetail' ? (++detailCalls === 1 ? { data: detail } : refresh.promise) : { data: { cart_item_id: 'c1' } });
  const p = page<{ item: StandardItemDetail | null; loading: boolean; sku: StandardItemDetail['skus'][number] | null; error: string }>('product', request);
  await p.call('onLoad', { id: 'p1' }); await vi.waitFor(() => expect(p.data.loading).toBe(false));
  expect(p.data.sku?.sku_id).toBe('s1');
  const loading = p.call('load');
  refresh.reject(new Error('商品已下架')); await loading;
  request.mockClear(); await p.call('addCart'); await p.call('buy');
  expect(request).not.toHaveBeenCalled(); expect(p.open).not.toHaveBeenCalled();
  expect(p.data).toMatchObject({ item: null, sku: null, selection: {}, dimensions: [], priceText: '', totalText: '0.00', quantity: 1, coverUrl: '', gallery: [], loading: false, error: '商品已下架' });
});
it('keeps a newer failed product refresh authoritative over an older successful response', async () => {
  const detail = { item_id: 'p1', name: '手串', description: null, images: [], spec_schema: { dimensions: [] }, skus: [{ sku_id: 's1', available_stock: 9, spec_values: {}, price_cent: 100, image_file_id: null }] } satisfies StandardItemDetail;
  const oldDetail = deferred<{ data: StandardItemDetail }>(); let calls = 0;
  const p = page<{ loading: boolean; item: StandardItemDetail | null; sku: StandardItemDetail['skus'][number] | null; error: string }>('product', async () => {
    if (++calls === 1) return { data: detail };
    if (calls === 2) return oldDetail.promise;
    throw new Error('最新商品状态不可用');
  });
  await p.call('onLoad', { id: 'p1' }); await vi.waitFor(() => expect(p.data.loading).toBe(false));
  const older = p.call('load'); await p.call('load'); oldDetail.resolve({ data: detail }); await older;
  expect(p.data).toMatchObject({ item: null, sku: null, error: '最新商品状态不可用', loading: false });
});

describe('points presentation and balance truth', () => {
  it.each(['success', 'failure'])('keeps post-check-in balance and status when an older points-center query ends with %s', async result => {
    const oldCenter = deferred<{ data: PointsCenter }>(); const newCenter = deferred<{ data: PointsCenter }>(); let calls = 0;
    const request = vi.fn(async (action: string) => {
      if (action === 'dailyCheckIn') return { data: { awarded_points: 5, balance: '105', checked_in_date: '2026-10-22', idempotent_replay: false } };
      return ++calls === 1 ? oldCenter.promise : newCenter.promise;
    });
    const p = page<{ center: PointsCenter | null; loading: boolean; submitting: boolean; error: string }>('points', request);
    p.data.center = { ...center, balance: '100', checked_in_today: false };
    const loading = p.call('onShow'); const checking = p.call('checkIn');
    await vi.waitFor(() => expect(calls).toBe(2));
    newCenter.resolve({ data: { ...center, balance: '105', checked_in_today: true } }); await checking;
    if (result === 'success') oldCenter.resolve({ data: { ...center, balance: '100', checked_in_today: false } });
    else oldCenter.reject(new Error('过期中心查询失败'));
    await loading;
    expect(p.data).toMatchObject({ center: { balance: '105', checked_in_today: true }, loading: false, submitting: false, error: '' });
    await p.call('checkIn'); expect(request.mock.calls.filter(call => call[0] === 'dailyCheckIn')).toHaveLength(1);
  });
  it('does not clear the newer points-center loading state when a stale request finishes first', async () => {
    const oldCenter = deferred<{ data: PointsCenter }>(); const newCenter = deferred<{ data: PointsCenter }>(); let calls = 0;
    const p = page<{ center: PointsCenter | null; loading: boolean }>('points', async action => {
      if (action === 'dailyCheckIn') return { data: { awarded_points: 5, balance: '105', checked_in_date: '2026-10-22', idempotent_replay: false } };
      return ++calls === 1 ? oldCenter.promise : newCenter.promise;
    });
    const loading = p.call('load'); const checking = p.call('checkIn'); await vi.waitFor(() => expect(calls).toBe(2));
    oldCenter.resolve({ data: { ...center, balance: '100', checked_in_today: false } }); await loading;
    expect(p.data.loading).toBe(true);
    newCenter.resolve({ data: { ...center, balance: '105', checked_in_today: true } }); await checking;
    expect(p.data.center?.balance).toBe('105'); expect(p.data.loading).toBe(false);
  });
  it('keeps the confirmed check-in result if the subsequent center refresh fails', async () => {
    const p = page<{ center: PointsCenter | null; error: string }>('points', async action => {
      if (action === 'dailyCheckIn') return { data: { awarded_points: 5, balance: '105', checked_in_date: '2026-10-22', idempotent_replay: false } };
      throw new Error('刷新失败');
    });
    p.data.center = { ...center, balance: '100', checked_in_today: false };
    await p.call('checkIn');
    expect(p.data).toMatchObject({ center: { balance: '105', checked_in_today: true }, error: '刷新失败' });
  });
  it('queues a points-center return refresh behind the invalidated query without duplicate requests', async () => {
    const oldCenter = deferred<{ data: PointsCenter }>(); let calls = 0;
    const p = page<{ center: PointsCenter | null; loading: boolean }>('points', async () => ++calls === 1 ? oldCenter.promise : { data: { ...center, balance: '90' } });
    const loading = p.call('onShow'); await p.call('onHide'); await p.call('onShow'); await p.call('onShow');
    expect(calls).toBe(1); oldCenter.resolve({ data: { ...center, balance: '100' } }); await loading;
    expect(calls).toBe(2); expect(p.data).toMatchObject({ center: { balance: '90' }, loading: false });
  });
  it('formats recent ledger dates in China time and signs decimal strings without coercion', async () => {
    const p = page<{ center: Omit<PointsCenter, 'recent_ledger'> & { recent_ledger: LedgerRow[] } }>('points', async () => ({ data: center }));
    await p.call('load');
    expect(p.data.center.balance).toBe('9007199254740993');
    expect(p.data.center.recent_ledger.map(row => [row.timeText, row.pointsText, row.points_delta])).toEqual([
      ['2026-10-22 02:02:03', '+9007199254740993', '9007199254740993'], ['2026-10-22 09:00:00', '-9007199254740993', '-9007199254740993'],
    ]);
  });
  it('loads a real ledger header and preserves formatted rows across filtering and pagination', async () => {
    const request = vi.fn(async (action: string, payload: Record<string, unknown>) => ({ data: action === 'getPointsCenter' ? center : { items: payload.page_token ? [ledger[1]] : [ledger[0]], next_page_token: payload.page_token ? null : 'next' } }));
    const p = page<{ balance: string; items: LedgerRow[]; direction: string }>('points-ledger', request);
    await p.call('onLoad'); await p.call('onShow');
    expect(p.data.balance).toBe(center.balance);
    expect(p.data.items[0]).toMatchObject({ timeText: '2026-10-22 02:02:03', pointsText: '+9007199254740993' });
    await p.call('more');
    expect(p.data.items.map(row => row.pointsText)).toEqual(['+9007199254740993', '-9007199254740993']);
    await p.call('filter', event({ value: 'SPEND' }));
    expect(request).toHaveBeenLastCalledWith('listMyPointsLedger', { direction: 'SPEND', page_token: null, page_size: 20 });
    await p.call('mall'); expect(p.open).toHaveBeenCalledWith('/pages/points-mall/index');
  });
  it('keeps a failed ledger header unknown and independently displays successful rows', async () => {
    const p = page<{ balance: string; centerError: string; items: LedgerRow[] }>('points-ledger', async action => {
      if (action === 'getPointsCenter') throw new Error('余额读取失败');
      return { data: { items: ledger, next_page_token: null } };
    });
    await p.call('onLoad'); await p.call('onShow');
    expect(p.data).toMatchObject({ balance: '—', centerError: '余额读取失败' }); expect(p.data.items).toHaveLength(2);
    await p.call('loadCenter'); expect(p.data.balance).toBe('—');
  });
  it.each(['success', 'failure'])('invalidates the initial ledger balance and queues a fresh one on return when the old query ends with %s', async result => {
    const oldCenter = deferred<{ data: PointsCenter }>(); let centerCalls = 0;
    const request = vi.fn(async (action: string) => {
      if (action === 'getPointsCenter') return ++centerCalls === 1 ? oldCenter.promise : { data: { ...center, balance: '90' } };
      return { data: { items: ledger, next_page_token: null } };
    });
    const p = page<{ balance: string; centerLoading: boolean; centerError: string }>('points-ledger', request);
    await p.call('onLoad'); const loading = p.call('onShow');
    await p.call('onHide'); await p.call('onShow'); await p.call('onHide'); await p.call('onShow');
    expect(centerCalls).toBe(1);
    if (result === 'success') oldCenter.resolve({ data: { ...center, balance: '100' } });
    else oldCenter.reject(new Error('过期余额查询失败'));
    await loading; await vi.waitFor(() => expect(p.data.balance).toBe('90'));
    expect(centerCalls).toBe(2); expect(p.data).toMatchObject({ centerLoading: false, centerError: '' });
  });
  it('starts the mall with unknown balance and independently keeps successful balance on list failure', async () => {
    const request = vi.fn(async (action: string) => { if (action === 'getPointsCenter') return { data: center }; if (action === 'listDiyMaterials') return { data: mallCategories }; if (action === 'listPointsExchangeSkus') throw new Error('商品读取失败'); throw new Error(action); });
    const p = page<{ balance: string; error: string; loading: boolean }>('points-mall', request);
    expect(p.data.balance).toBe('—');
    await p.call('onLoad'); await p.call('onShow');
    expect(p.data).toMatchObject({ balance: center.balance, loading: false }); expect(p.data.error).toContain('商品读取失败');
    expect(request.mock.calls).toHaveLength(3);
  });
  it('keeps successful mall items when the balance query fails and surfaces both failure messages', async () => {
    let listFails = false;
    const p = page<{ balance: string; error: string; items: { sku_id: string }[] }>('points-mall', async action => {
      if (action === 'getPointsCenter') throw new Error('积分服务失败');
      if (action === 'listDiyMaterials') return { data: mallCategories };
      if (action !== 'listPointsExchangeSkus') throw new Error(action);
      if (listFails) throw new Error('商品服务失败');
      return { data: { items: [{ sku_id: 'sku1', image_file_id: null }], next_page_token: null } };
    });
    await p.call('onLoad'); await p.call('onShow');
    expect(p.data.balance).toBe('—'); expect(p.data.items).toHaveLength(1); expect(p.data.error).toContain('积分服务失败');
    listFails = true; await p.call('load');
    expect(p.data.error).toContain('积分服务失败'); expect(p.data.error).toContain('商品服务失败');
  });
  it('refreshes mall on return while suppressing concurrent show/retry requests', async () => {
    let finish: (response: unknown) => void = () => {};
    const pending = new Promise(resolve => { finish = resolve; });
    let balance = '20';
    const request = vi.fn(async (action: string) => { if (action === 'getPointsCenter') return { data: { ...center, balance } }; if (action === 'listDiyMaterials') return { data: mallCategories }; if (action === 'listPointsExchangeSkus') return pending; throw new Error(action); });
    const p = page<{ balance: string }>('points-mall', request);
    await p.call('onLoad'); const loading = p.call('onShow'); await p.call('onShow'); await p.call('load');
    expect(request.mock.calls).toHaveLength(3);
    finish({ data: { items: [], next_page_token: null } }); await loading;
    expect(p.data.balance).toBe('20'); balance = '25'; await p.call('onShow'); expect(p.data.balance).toBe('25');
    expect(request.mock.calls).toHaveLength(6);
  });
  it.each(['success', 'failure'])('keeps confirmed exchange balance when an older center query finishes with %s', async result => {
    const oldCenter = deferred<{ data: PointsCenter }>();
    const request = vi.fn(async (action: string) => {
      if (action === 'getPointsCenter') return oldCenter.promise;
      if (action === 'listDiyMaterials') return { data: mallCategories };
      if (action === 'exchangePointsForSkuCoupon') return { data: exchanged };
      if (action !== 'listPointsExchangeSkus') throw new Error(action);
      return { data: { items: [exchangeSku], next_page_token: null, image_urls: {} } };
    });
    const p = page<{ balance: string; items: PointsExchangeSku[]; error: string }>('points-mall', request);
    await p.call('onLoad'); const loading = p.call('onShow');
    await vi.waitFor(() => expect(p.data.items).toHaveLength(1));
    await p.call('exchange', event({ id: '1' }));
    expect(p.data.balance).toBe('90');
    if (result === 'success') oldCenter.resolve({ data: { ...center, balance: '100' } });
    else oldCenter.reject(new Error('已过期查询失败'));
    await loading;
    expect(p.data.balance).toBe('90'); expect(p.data.error).toBe('');
    expect(request.mock.calls.filter(call => call[0] === 'exchangePointsForSkuCoupon')).toHaveLength(1);
  });
  it('queues exactly one return refresh behind an existing request without concurrent loads', async () => {
    const firstList = deferred<{ data: { items: PointsExchangeSku[]; next_page_token: null } }>();
    let listCalls = 0; let balance = '100';
    const request = vi.fn(async (action: string) => {
      if (action === 'getPointsCenter') return { data: { ...center, balance } };
      if (action === 'listDiyMaterials') return { data: mallCategories };
      if (action !== 'listPointsExchangeSkus') throw new Error(action);
      if (++listCalls === 1) return firstList.promise;
      return { data: { items: [], next_page_token: null } };
    });
    const p = page<{ balance: string; loading: boolean }>('points-mall', request);
    await p.call('onLoad'); const loading = p.call('onShow');
    await vi.waitFor(() => expect(p.data.balance).toBe('100'));
    balance = '105';
    await p.call('onHide'); await p.call('onShow');
    await p.call('onHide'); await p.call('onShow');
    expect(request.mock.calls).toHaveLength(3);
    firstList.resolve({ data: { items: [], next_page_token: null } }); await loading;
    await vi.waitFor(() => expect(p.data.balance).toBe('105'));
    expect(request.mock.calls).toHaveLength(6); expect(p.data.loading).toBe(false);
  });
});
