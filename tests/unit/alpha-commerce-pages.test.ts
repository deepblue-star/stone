import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import type { DiyMaterials, StandardItemDetail } from '../../packages/contracts/src/catalog';
import type { DesignVersionDetail, DesignVersionPage } from '../../packages/contracts/src/design';
import type { Cart } from '../../packages/contracts/src/cart';

function page(name: string, request: (action: string, payload: any) => Promise<any>, storage = new Map<string, any>(), payment = vi.fn(async (_: string) => ({ state: 'PENDING' }))) {
  let p: any = { data: {} }; const open = vi.fn(); const redirect = vi.fn();
  const native = { showToast: vi.fn(), showModal: vi.fn((o: any) => o.success({ confirm: true })), navigateBack: vi.fn(), redirectTo: redirect, setClipboardData: vi.fn(), getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: any) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) };
  function load(path: string): any { const module = { exports: {} }; runInNewContext(readFileSync(path, 'utf8'), { module }); return module.exports; }
  const file = `miniprogram/pages/${name}/index.js`;
  if (existsSync(file)) runInNewContext(readFileSync(file, 'utf8'), {
    Page(value: any) { p = value; p.data = structuredClone(p.data); p.setData = (patch: any) => Object.assign(p.data, patch); }, wx: native, setInterval, clearInterval,
    require(path: string) {
      if (path.endsWith('/api')) return { request };
      if (path.endsWith('/navigation')) return { open, query: (route: string, params: Record<string, string>) => route + '?' + new URLSearchParams(params).toString() };
      if (path.endsWith('/payment')) return { requestOrderPayment: payment };
      if (path.endsWith('/regions')) return [{ code: '440000', name: '广东省', children: [{ code: '440300', name: '深圳市', children: [{ code: '440305', name: '南山区' }] }] }];
      return load('miniprogram/services/' + path.split('/').pop() + '.js');
    },
  });
  return { p, open, redirect, native, payment, call: async (method: string, ...args: any[]) => { expect(typeof p[method], `${name}.${method} exists`).toBe('function'); return p[method](...args); } };
}
const event = (dataset: object) => ({ currentTarget: { dataset } });
const quote = { quote_hash: 'q1', address: { address_id: '8', receiver_name: '张', phone_masked: '138****0000', full_address: '广东' }, items: [{ source_type: 'STANDARD', source_id: 's1', cart_item_id: 'c1', name: '手串', quantity: 2, image_file_id: null, gross_amount_cent: 200, discount_amount_cent: 0, line_amount_cent: 200, purchasable: true, applied_sku_coupons: [] }], goods_amount_cent: 200, discount_amount_cent: 0, shipping_fee_cent: 80, total_amount_cent: 280 };
const designMaterials: DiyMaterials = { categories: [], items: [{ id: 'item1', category_id: 'category1', name: '材料', is_on_sale: true, skus: [{ id: 's1', diameter_mm: 8, price_cent: 100, available_stock: 10, is_on_sale: true, image_file_id: null }] }] };
const designVersions: DesignVersionPage = { design_id: 'd1', versions: [], current_version_no: 2, next_page_token: null };

it('lists designs with signed thumbnails and uses the fixed current version', async () => {
  const request = vi.fn(async () => ({ data: { designs: [{ design_id: 'd1', name: '设计', current_design_version_id: 'v1', thumbnail_file_id: 'f1' }], next_page_token: null, image_urls: { f1: 'https://image' } } }));
  const t = page('designs', request); await t.call('load'); expect(request).toHaveBeenCalledWith('listDesigns', { page_token: null, page_size: 20 });
  expect(t.p.data.items[0].imageUrl).toBe('https://image'); await t.call('detail', event({ index: 0 })); expect(t.open).toHaveBeenCalledWith('/pages/design/index?design_version_id=v1');
});
it('shows snapshot fallback and locks add-to-cart to the selected version', async () => {
  let available = false;
  const detail: DesignVersionDetail = { design_id: 'd1', design_version_id: 'v1', version_no: 1, name: '手串', components: [{ sku_id: 's1', snapshot: { name: '旧材料', diameter_mm: 8, image_file_id: null }, current: null, purchasable: false, changed: false, unavailable_reason: '资料缺失' }] };
  const request = vi.fn(async (action: string, payload: Record<string, unknown>) => {
    if (action === 'getDesignVersion') return { data: available ? { ...detail, components: detail.components.map(item => ({ ...item, current: item.snapshot, purchasable: true, unavailable_reason: null })) } : detail };
    if (action === 'listDesignVersions') return { data: designVersions };
    if (action === 'listDiyMaterials') return { data: payload.catalog_type === 'BEAD' ? designMaterials : { categories: [], items: [] } satisfies DiyMaterials };
    if (action === 'getMyAvailableSkuCoupons') return { data: { items: [] } };
    if (action === 'addCartItem') return { data: { cart_item_id: 'c1', quantity: 1 } };
    throw new Error(action);
  });
  const t = page('design', request); t.p.versionId = 'v1'; await t.call('load'); expect(t.p.data.components[0]).toMatchObject({ name: '旧材料', missing: true });
  available = true; await t.call('load'); await t.call('addCart'); expect(request).toHaveBeenCalledWith('addCartItem', { item_type: 'DESIGN', design_version_id: 'v1', quantity: 1 });
});
it('cart changes quantities via singular DTO and deletes each selected item', async () => {
  const cart: Cart = { items: ['c1','c2'].map(cart_item_id => ({ cart_item_id, sku_id: 's1', design_version_id: null, quantity: 1, item_type: 'STANDARD', purchasable: true, unavailable_reason: null, display: { name: '手串', spec_text: '8mm', image_file_id: null, current_unit_price_cent: 100 } })) };
  const request = vi.fn(async (action: string, payload: Record<string, unknown>) => { if (action === 'getCart') return { data: cart }; if (action === 'listAddresses') return { data: { addresses: [] } }; if (action === 'updateCartItem') return { data: { cart_item_id: payload.cart_item_id, quantity: payload.quantity } }; if (action === 'deleteCartItem') return { data: { cart_item_id: payload.cart_item_id } }; throw new Error(action); }); const t = page('cart', request); await t.call('load');
  await t.call('quantity', event({ index: 0, delta: 1 })); expect(request).toHaveBeenCalledWith('updateCartItem', { cart_item_id: 'c1', quantity: 2 });
  await t.call('toggleAll'); await t.call('removeSelected'); expect(request).toHaveBeenCalledWith('deleteCartItem', { cart_item_id: 'c1' }); expect(request).toHaveBeenCalledWith('deleteCartItem', { cart_item_id: 'c2' });
});
it('address selection returns only the address ID to checkout', async () => {
  const storage = new Map(); const t = page('addresses', async () => ({ data: { addresses: [{ address_id: '8', is_default: true }] } }), storage); t.p.selecting = true; await t.call('load'); await t.call('choose', event({ id: '8' })); expect(storage.get('stone.selectedAddressId')).toBe('8'); expect(t.native.navigateBack).toHaveBeenCalled();
});
it('address editor uses only enabled shipping provinces and bundled city/district codes', async () => {
  const request = vi.fn(async (action: string) => ({ data: action === 'getShippingRegions' ? { regions: [{ province_code: '440000', province_name: '广东省' }] } : { address_id: '8' } }));
  const t = page('address-edit', request); await t.call('load'); t.p.data.form = { receiver_name: '张三', phone: '13800000000', address_line: '科苑路1号', set_as_default: true }; await t.call('regionChange', { detail: { value: [0,0,0] } }); await t.call('save');
  expect(request).toHaveBeenCalledWith('saveAddress', { address_id: null, receiver_name: '张三', phone: '13800000000', address_line: '科苑路1号', set_as_default: true, province_code: '440000', city_code: '440300', city: '深圳市', district_code: '440305', district: '南山区' });
});
it('checkout preserves its key after unknown create result and navigates original order after payment failure', async () => {
  let creates = 0; const request = vi.fn(async (action: string, _payload: any) => { if (action === 'listAddresses') return { data: { addresses: [{ address_id: '8', is_default: true }] } }; if (action === 'previewDirectOrder') return { data: quote }; if (action === 'createDirectOrder') { creates++; if (creates === 1) throw new Error('网络失败'); return { data: { order_no: 'O1', requires_payment: true } }; } throw new Error(action); });
  const payment = vi.fn(async () => { throw new Error('支付未配置'); }); const t = page('checkout', request, new Map(), payment); await t.call('onLoad', { item_type: 'STANDARD', sku_id: 's1', quantity: '2' }); await t.call('onShow'); await t.call('submit'); const key = request.mock.calls.find(c => c[0] === 'createDirectOrder')![1].checkout_key;
  await t.call('submit'); const calls = request.mock.calls.filter(c => c[0] === 'createDirectOrder'); expect(calls[1]![1].checkout_key).toBe(key); expect(calls[1]![1]).toMatchObject({ sku_id: 's1', quantity: 2, address_id: '8', quote_hash: 'q1' }); expect(payment).toHaveBeenCalledWith('O1'); expect(t.redirect).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('order_no=O1') })); expect(t.p.data.submitting).toBe(false);
});
it('checkout requires another confirmation after the server replaces an outdated quote', async () => {
  const latest = { ...quote, quote_hash: 'q2', total_amount_cent: 300 }; const request = vi.fn(async (action: string) => { if (action === 'listAddresses') return { data: { addresses: [{ address_id: '8', is_default: true }] } }; if (action === 'previewDirectOrder') return { data: quote }; throw Object.assign(new Error('金额变化'), { code: 'CHECKOUT_CHANGED', data: latest }); });
  const t = page('checkout', request); await t.call('onLoad', { item_type: 'STANDARD', sku_id: 's1', quantity: '2' }); await t.call('onShow'); await t.call('submit'); expect(t.p.data.quote.quote_hash).toBe('q2'); expect(t.p.data.totalText).toBe('3.00'); expect(t.p.data.error).toContain('重新确认'); expect(t.redirect).not.toHaveBeenCalled();
});
it('order filters reset pagination and preserve exact server statuses', async () => {
  const request = vi.fn(async () => ({ data: { orders: [{ order_no: 'O1', status: 'READY_TO_SHIP', total_amount_cent: '9007199254740993', created_at: '2026-01-01T00:00:00Z' }], next_page_token: 'next' } })); const t = page('orders', request); await t.call('filter', event({ status: 'READY_TO_SHIP' })); expect(request).toHaveBeenCalledWith('listMyOrders', { status: 'READY_TO_SHIP', page_token: null, page_size: 20 }); expect(t.p.data.items[0].amountText).toBe('90071992547409.93'); await t.call('more'); expect(request).toHaveBeenLastCalledWith('listMyOrders', { status: 'READY_TO_SHIP', page_token: 'next', page_size: 20 });
});
it('order detail maps immutable snapshots and continues only the original order', async () => {
  const t = page('order', async () => ({ data: { ...quote, order_no: 'O1', status: 'PENDING_PAYMENT', can_pay: true, payment_deadline_at: '2099-01-01T00:00:00Z', address_snapshot: quote.address, items: [{ item_type: 'STANDARD', quantity: 2, line_amount_cent: 200, item_snapshot: { name: '成交名称', spec_text: '8mm' } }], shipping: { carrier_name: '顺丰', tracking_no: 'SF1', shipped_at: '2026-01-01T00:00:00Z' } } })); t.p.orderNo = 'O1'; await t.call('load'); expect(t.p.data.items[0].name).toBe('成交名称'); await t.call('pay'); expect(t.payment).toHaveBeenCalledWith('O1'); await t.call('copyTracking'); expect(t.native.setClipboardData).toHaveBeenCalledWith({ data: 'SF1' }); await t.call('onUnload');
});
it('product purchase sends a standard SKU and retains quantity for checkout', async () => {
  const detail = { item_id: 'p1', name: '手串', description: null, images: [], spec_schema: { dimensions: [] }, skus: [{ sku_id: 's1', available_stock: 9, spec_values: {}, price_cent: 100, image_file_id: null }] } satisfies StandardItemDetail;
  const request = vi.fn(async (action: string) => ({ data: action === 'getStandardItemDetail' ? detail : { cart_item_id: 'c1' } })); const t = page('product', request); t.p.itemId = 'p1'; await t.call('load'); t.p.data.quantity = 2; await t.call('addCart'); expect(request).toHaveBeenCalledWith('addCartItem', { item_type: 'STANDARD', sku_id: 's1', quantity: 2 }); await t.call('buy'); expect(t.open).toHaveBeenCalledWith('/pages/checkout/index?item_type=STANDARD&sku_id=s1&quantity=2');
});

it('cart checkout creates with quantities from the server quote and skips payment only from server requires_payment', async () => {
  const request = vi.fn(async (action: string) => ({ data: action === 'listAddresses' ? { addresses: [{ address_id: '8', is_default: true }] } : action === 'previewOrderFromCart' ? quote : { order_no: 'O0', requires_payment: false, status: 'READY_TO_SHIP', payment_mode: 'ZERO_PAY' } }));
  const t = page('checkout', request); await t.call('onLoad', { cart_item_ids: 'c1' }); await t.call('onShow'); await t.call('submit');
  expect(request).toHaveBeenCalledWith('previewOrderFromCart', { cart_item_ids: ['c1'], address_id: '8' });
  expect(request).toHaveBeenCalledWith('createOrderFromCart', { checkout_key: expect.any(String), quote_hash: 'q1', cart_items: [{ cart_item_id: 'c1', quantity: 2 }], address_id: '8' });
  expect(t.payment).not.toHaveBeenCalled(); expect(t.redirect).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('order_no=O0') }));
});
it('reopens an unknown cart submission using its stored payload even after server cart removal', async () => {
  const storage = new Map(); const request = vi.fn(async (action: string, _payload: any) => { if (action === 'listAddresses') return { data: { addresses: [{ address_id: '8', is_default: true }] } }; if (action === 'previewOrderFromCart') return { data: quote }; throw new Error('响应丢失'); });
  const first = page('checkout', request, storage); await first.call('onLoad', { cart_item_ids: 'c1' }); await first.call('onShow'); await first.call('submit');
  const original = request.mock.calls.find(c => c[0] === 'createOrderFromCart')![1]; request.mockClear();
  const second = page('checkout', request, storage); await second.call('onLoad', { cart_item_ids: 'c1' }); await second.call('onShow'); await second.call('submit');
  expect(request).not.toHaveBeenCalledWith('previewOrderFromCart', expect.anything()); expect(request).toHaveBeenCalledWith('createOrderFromCart', original);
});
it('blocks duplicate checkout submits while its original creation is unresolved', async () => {
  let resolve: (value: any) => void = () => {}; const created = new Promise(r => { resolve = r; });
  const request = vi.fn(async (action: string) => action === 'listAddresses' ? { data: { addresses: [{ address_id: '8' }] } } : action === 'previewDirectOrder' ? { data: quote } : created);
  const t = page('checkout', request); await t.call('onLoad', { item_type: 'STANDARD', sku_id: 's1' }); await t.call('onShow'); const pending = t.call('submit'); await t.call('submit');
  expect(request.mock.calls.filter(call => call[0] === 'createDirectOrder')).toHaveLength(1); expect(t.p.data.submitting).toBe(true); resolve({ data: { order_no: 'O1', requires_payment: false } }); await pending; expect(t.p.data.submitting).toBe(false);
});
it('retains failed address form inputs and prevents arbitrary province submission', async () => {
  const request = vi.fn(async (action: string) => { if (action === 'getShippingRegions') return { data: { regions: [] } }; throw new Error('must not submit'); });
  const t = page('address-edit', request); await t.call('load'); t.p.data.form = { receiver_name: '张三', phone: '13800000000', address_line: '街道1号', set_as_default: false }; await t.call('save');
  expect(request.mock.calls.map(call => call[0])).toEqual(['getShippingRegions']); expect(t.p.data.form.receiver_name).toBe('张三'); expect(t.p.data.error).toContain('可配送'); expect(t.p.data.submitting).toBe(false);
});
it('disables expired payment without inventing a closed server status', async () => {
  const t = page('order', async () => ({ data: { ...quote, order_no: 'O1', status: 'PENDING_PAYMENT', can_pay: true, payment_deadline_at: '2000-01-01T00:00:00Z', address_snapshot: {}, items: [], shipping: null } }));
  t.p.orderNo = 'O1'; await t.call('load'); await t.call('pay'); expect(t.payment).not.toHaveBeenCalled(); expect(t.p.data.canPay).toBe(false); expect(t.p.data.order.status).toBe('PENDING_PAYMENT'); await t.call('onUnload');
});
it('keeps the previous confirmed address region when the picker is cancelled', async () => {
  const t = page('address-edit', async () => ({ data: { regions: [{ province_code: '440000', province_name: '广东省' }] } })); await t.call('load'); await t.call('regionChange', { detail: { value: [0,0,0] } }); await t.call('columnChange', { detail: { column: 0, value: 0 } }); await t.call('regionCancel'); expect(t.p.data.regionChosen).toBe(true); expect(t.p.data.regionValue.district_code).toBe('440305');
});

it('refreshes current material availability when returning to an existing design', async () => {
  const detail: DesignVersionDetail = { design_id: 'd1', design_version_id: 'v1', version_no: 1, name: '设计', components: [{ sku_id: 's1', snapshot: { name: '旧', diameter_mm: 8, image_file_id: null }, current: { name: '新', diameter_mm: 8, image_file_id: null }, changed: true, purchasable: false, unavailable_reason: '已下架' }] };
  const request = vi.fn(async (action: string, payload: Record<string, unknown>) => { if (action === 'getDesignVersion') return { data: detail }; if (action === 'listDesignVersions') return { data: { ...designVersions, current_version_no: 1 } }; if (action === 'listDiyMaterials') return { data: payload.catalog_type === 'BEAD' ? designMaterials : { categories: [], items: [] } satisfies DiyMaterials }; if (action === 'getMyAvailableSkuCoupons') return { data: { items: [] } }; throw new Error(action); });
  const t = page('design', request); t.p.versionId = 'v1'; await t.call('onShow'); expect(t.p.data.purchasable).toBe(false); expect(t.p.data.components[0]).toMatchObject({ name: '新', changed: true });
});
it('reuses each unresolved checkout fingerprint after the user visits another purchase', async () => {
  const storage = new Map(); const request = vi.fn(async (action: string, _payload: any) => { if (action === 'listAddresses') return { data: { addresses: [{ address_id: '8' }] } }; if (action === 'previewDirectOrder') return { data: quote }; throw new Error('响应丢失'); });
  const a = page('checkout', request, storage); await a.call('onLoad', { item_type: 'STANDARD', sku_id: 's1' }); await a.call('onShow'); await a.call('submit'); const original = request.mock.calls.find(c => c[0] === 'createDirectOrder')![1].checkout_key;
  const b = page('checkout', request, storage); await b.call('onLoad', { item_type: 'STANDARD', sku_id: 's2' }); await b.call('onShow'); await b.call('submit');
  const again = page('checkout', request, storage); await again.call('onLoad', { item_type: 'STANDARD', sku_id: 's1' }); await again.call('onShow'); await again.call('submit');
  expect(request.mock.calls.filter(c => c[0] === 'createDirectOrder').at(-1)![1].checkout_key).toBe(original);
});
it('gives each checkout line a stable unique render position for repeated source types', async () => {
  const t = page('checkout', async () => ({ data: {} }));
  await t.call('applyQuote', { ...quote, items: [quote.items[0], { ...quote.items[0], cart_item_id: 'c2' }] });
  expect(t.p.data.items.map((item: any) => item.index)).toEqual([0, 1]);
});
