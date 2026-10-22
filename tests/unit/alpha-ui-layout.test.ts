import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Window } from 'happy-dom';
const source = (file: string) => readFileSync('miniprogram/' + file, 'utf8');
function declarations(file: string, selector: string) {
  const css = source(file).replace(/@import[^;]+;/g, '');
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(match => match[1]?.trim() === selector);
  return Object.fromEntries((rule?.[2] || '').split(';').filter(part => part.includes(':')).map(part => part.split(':').map(value => value.trim())));
}
function buttonStyle(file: string, markup: string) {
  const window = new Window();
  const style = window.document.createElement('style');
  // Exact normal-button rule read from 3.17.4.wxvpkg /WASkylineStyleV2.css.js.
  const nativeRule = 'button.wx-button-size-normal{margin-left:auto;margin-right:auto;width:184px}button.wx-button-disabled.wx-button-type-primary{background-color:#fafafa;color:rgba(0,0,0,.18)}button.wx-button-disabled.wx-button-type-default,button.wx-button-disabled.wx-button-type-none{background-color:#fafafa;color:rgba(0,0,0,.18)}';
  style.textContent = nativeRule + source(file).replace(/@import[^;]+;/g, '');
  window.document.head.appendChild(style);
  window.document.body.innerHTML = markup;
  const button = window.document.querySelector('button');
  if (!button) throw new Error('Button fixture missing');
  let clicks = 0;
  button.addEventListener('click', () => { clicks += 1; }); button.click();
  const computed = window.getComputedStyle(button);
  return { width: computed.width, marginLeft: computed.marginLeft, marginRight: computed.marginRight, color: computed.color, background: computed.backgroundColor, opacity: computed.opacity, disabled: button.disabled, clicks };
}
it('constrains navigation text while keeping the fixed left and capsule reserves', () => {
  expect(declarations('components/navigation-bar/navigation-bar.wxss', '.weui-navigation-bar__center')).toMatchObject({ 'min-width': '0', overflow: 'hidden' });
  expect(declarations('components/navigation-bar/navigation-bar.wxss', '.weui-navigation-bar__title')).toMatchObject({ 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis', 'max-width': '100%' });
  expect(declarations('components/navigation-bar/navigation-bar.wxss', '.weui-navigation-bar__left')['flex-shrink']).toBe('0');
  expect(source('components/navigation-bar/navigation-bar.wxml')).toContain('class="weui-navigation-bar__title"');
  expect(source('components/navigation-bar/navigation-bar.js')).toContain('innerPaddingRight');
});
it('keeps product actions in a single row and renders the current total on buy', () => {
  expect(declarations('pages/product/index.wxss', '.product-actions button')).toMatchObject({ width: 'auto', 'white-space': 'nowrap', 'min-width': '0' });
  expect(declarations('pages/product/index.wxss', '.service-action')['flex-shrink']).toBe('0');
  expect(declarations('pages/product/index.wxss', '.spec-options')).toMatchObject({ 'flex-direction': 'row', 'flex-wrap': 'wrap', 'justify-content': 'flex-start' });
  expect(declarations('pages/product/index.wxss', '.spec-options .spec-chip')).toMatchObject({ width: 'auto', flex: '0 0 auto', 'white-space': 'nowrap' });
  expect(source('pages/product/index.wxml')).toContain('立即购买 ¥{{totalText}}');
  expect(source('pages/product/index.wxml')).toContain('disabled="{{submitting || loading || error || !item || !sku || sku.available_stock < quantity}}"');
});
it('keeps the product name and standard item type before the standalone price and options', () => {
  const product = source('pages/product/index.wxml');
  const name = product.indexOf('class="detail-name"');
  const type = product.indexOf('class="detail-type"');
  const price = product.indexOf('class="detail-price"');
  const options = product.indexOf('class="spec-section"');
  expect(name).toBeGreaterThan(-1); expect(type).toBeGreaterThan(-1); expect(price).toBeGreaterThan(-1);
  expect(name).toBeLessThan(type); expect(type).toBeLessThan(price); expect(price).toBeLessThan(options);
  expect(product).toContain('标准商品'); expect(product).toContain("{{priceText||'—'}}");
});
it('makes the DIY entry full content width with vertical text while retaining the recent scroller', () => {
  expect(declarations('pages/diy/index.wxss', '.section .custom-entry')).toMatchObject({ width: '100%', 'box-sizing': 'border-box', display: 'flex', 'flex-direction': 'column' });
  expect(source('pages/diy/index.wxml')).toContain('class="recent-scroll" scroll-x');
  expect(source('pages/diy/index.wxml')).toContain('bindtap="more"');
});
it('overrides the real Skyline v2 normal-button width and auto margins for specification options', () => {
  expect(buttonStyle('pages/product/index.wxss', '<view class="spec-options"><button class="wx-button-size-normal spec-chip selected">8 mm</button></view>')).toMatchObject({ width: 'auto', marginLeft: '0px', marginRight: '0px' });
});
it('overrides the real Skyline v2 normal-button width and auto margins for the DIY entry', () => {
  expect(buttonStyle('pages/diy/index.wxss', '<view class="section"><button class="wx-button-size-normal custom-entry">手串定制</button></view>')).toMatchObject({ width: '100%', marginLeft: '0px', marginRight: '0px' });
});
it('reserves an explicit horizontal viewport and bounds each recent-design card slot', () => {
  const viewport = declarations('pages/diy/index.wxss', '.recent-scroll');
  const card = declarations('pages/diy/index.wxss', '.design-card');
  const name = declarations('pages/diy/index.wxss', '.design-name');
  const date = declarations('pages/diy/index.wxss', '.date');
  const button = declarations('pages/diy/index.wxss', '.design-card .secondary');
  for (const slot of [name, date]) expect(slot).toMatchObject({ 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis', 'box-sizing': 'border-box' });
  const cardHeight = parseFloat(card.height || '0');
  expect(parseFloat(viewport.height || '0')).toBeGreaterThanOrEqual(cardHeight);
  expect(cardHeight).toBeGreaterThanOrEqual(240 + parseFloat(name.height || '0') + parseFloat(date.height || '0') + parseFloat(button.height || '0') + 2);
  expect(viewport['flex-shrink']).toBe('0');
  expect(source('pages/diy/index.wxml')).toMatch(/<scroll-view\b[^>]*wx:if="\{\{designs.length\}\}"[^>]*class="recent-scroll"/);
});
it('puts all order filters into a horizontal scroller and uses truthful amount wording', () => {
  expect(source('pages/orders/index.wxml')).toMatch(/<scroll-view[^>]*class="order-filter-scroll"[^>]*scroll-x/);
  expect(declarations('pages/orders/index.wxss', '.filters')).toMatchObject({ 'flex-wrap': 'nowrap', width: '840rpx' });
  expect(declarations('pages/orders/index.wxss', '.filters .filter')).toMatchObject({ flex: '0 0 auto', width: 'auto', 'min-height': '88rpx', 'white-space': 'nowrap' });
  expect(source('pages/orders/index.wxml')).toContain('订单金额 ¥{{item.amountText}}');
  expect(source('pages/orders/index.wxml')).not.toContain('实付');
});
it('gives order filters a nonzero horizontal viewport and room for all six touch targets', () => {
  const viewport = declarations('pages/orders/index.wxss', '.order-filter-scroll');
  const content = declarations('pages/orders/index.wxss', '.filters');
  const button = declarations('pages/orders/index.wxss', '.filters .filter');
  expect(parseFloat(viewport.height || '0')).toBeGreaterThanOrEqual(parseFloat(content.height || '0') + 1);
  expect(parseFloat(content.height || '0')).toBeGreaterThanOrEqual(parseFloat(button.height || '0') + 32);
  expect(parseFloat(content.width || '0')).toBeGreaterThanOrEqual(6 * parseFloat(button['min-width'] || '0') + 5 * parseFloat(content.gap || '0') + 32);
  expect(content).toMatchObject({ display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'nowrap', 'box-sizing': 'border-box' });
  expect(viewport['flex-shrink']).toBe('0');
});
it('overrides Skyline native normal-button width and auto margins for each order filter', () => {
  expect(buttonStyle('pages/orders/index.wxss', '<view class="filters"><button class="filter wx-button-size-normal">待付款</button></view>')).toMatchObject({ width: 'auto', marginLeft: '0px', marginRight: '0px' });
});
it('gives BEAD categories a horizontal viewport and content-sized buttons despite Skyline UA styles', () => {
  expect(source('pages/points-mall/index.wxml')).toMatch(/<scroll-view[^>]*class="mall-category-scroll"[^>]*scroll-x/);
  expect(parseFloat(declarations('pages/points-mall/index.wxss', '.mall-category-scroll').height || '0')).toBeGreaterThanOrEqual(100);
  expect(declarations('pages/points-mall/index.wxss', '.mall-categories')).toMatchObject({ display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'nowrap', 'min-width': '100%' });
  expect(source('pages/points-mall/index.wxml')).toContain('style="width: {{categoryWidth}}rpx"');
  expect(declarations('pages/points-mall/index.wxss', '.mall-categories .category-button')).toMatchObject({ 'white-space': 'nowrap', flex: '0 0 auto' });
  expect(buttonStyle('pages/points-mall/index.wxss', '<view class="mall-categories"><button class="category-button wx-button-size-normal">很长的后台分类名称</button></view>')).toMatchObject({ width: 'auto', marginLeft: '0px', marginRight: '0px' });
});
it('keeps cart estimated total beside checkout and labels design price as an estimate', () => {
  expect(source('pages/cart/index.wxml')).toContain('class="cart-checkout-row"');
  expect(source('pages/cart/index.wxml')).toContain('最终金额在确认页由服务端核算');
  expect(source('pages/cart/index.wxml')).not.toContain('未扣兑换券');
  expect(declarations('pages/cart/index.wxss', '.cart-checkout-row')).toMatchObject({ display: 'flex', 'flex-direction': 'row' });
  expect(source('pages/design/index.wxml')).toContain('预计价');
  expect(source('pages/design/index.wxml')).toContain('{{estimateText}}');
});
it('marks known design estimates as RMB while leaving unknown estimates as plain text', () => {
  const markup = source('pages/design/index.wxml');
  expect(markup).toContain('<text class="price" wx:if="{{estimateText !== \'无法估算\'}}">¥{{estimateText}}</text>');
  expect(markup).toContain('<text class="price" wx:else>{{estimateText}}</text>');
});
it('renders cart price labels and values as explicit Skyline text nodes', () => {
  const markup = source('pages/cart/index.wxml');
  const parts = markup.match(/<view wx:if="\{\{goodsText\}\}" class="muted cart-price-parts cart-price-breakdown">([\s\S]*?)<\/view>/)?.[1] || '';
  expect(parts).toContain('<text>商品 </text>');
  expect(parts).toContain('<text>¥{{goodsText}}</text>');
  expect(parts).toContain('<text> · 券 </text>');
  expect(parts).toContain('<text>−¥{{discountText}}</text>');
  expect(parts).toContain('<text> · 运费 </text>');
  expect(parts).toContain('<text>¥{{shippingText}}</text>');
  expect(parts.replace(/<text>[\s\S]*?<\/text>/g, '').trim()).toBe('');
});
it('keeps cart price text nodes in a compact wrapping row without changing the final-price note', () => {
  expect(declarations('pages/cart/index.wxss', '.cart-price-breakdown')).toMatchObject({ display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'wrap', gap: '4rpx' });
  expect(source('pages/cart/index.wxml')).toContain('class="muted cart-price-parts cart-price-breakdown"');
  expect(source('pages/cart/index.wxml')).toContain('<view class="muted cart-price-parts">最终金额在确认页由服务端核算。</view>');
});
it('uses formatted ledger fields and puts balance and exchange before filters', () => {
  for (const file of ['pages/points/index.wxml', 'pages/points-ledger/index.wxml']) {
    expect(source(file)).toContain('{{item.timeText}}'); expect(source(file)).toContain('{{item.pointsText}}');
  }
  const ledger = source('pages/points-ledger/index.wxml');
  expect(ledger).toContain('{{balance}}'); expect(ledger).toContain('bindtap="mall"');
  expect(ledger.indexOf('bindtap="mall"')).toBeLessThan(ledger.indexOf('class="filters'));
});
it('keeps native disabled semantics but supplies readable disabled colors without opacity stacking', () => {
  expect(declarations('styles/alpha.wxss', '.screen button.is-disabled')).toMatchObject({ color: '#666', background: '#eee', opacity: '1' });
  expect(source('styles/alpha.wxss')).not.toMatch(/\[[^\]]+\]\s*\{/);
  expect(source('pages/points/index.wxml')).toContain('disabled="{{submitting||!center||center.checked_in_today}}"');
});
it.each(['default', 'primary'])('keeps the disabled check-in button readable against Skyline native %s rules and unclickable', type => {
  expect(buttonStyle('styles/alpha.wxss', `<view class="screen"><button class="primary is-disabled wx-button-disabled wx-button-type-${type}" disabled>今日已签到</button></view>`)).toMatchObject({ color: '#666', background: '#eee', opacity: '1', disabled: true, clicks: 0 });
});
it.each(['cart-action', 'buy-action'])('keeps disabled product %s text readable against Skyline native default rules', action => {
  expect(buttonStyle('pages/product/index.wxss', `<view class="product-actions"><button class="${action} is-disabled wx-button-disabled wx-button-type-default" disabled>购买</button></view>`)).toMatchObject({ color: '#666', background: '#eee', opacity: '1', disabled: true, clicks: 0 });
});
it.each([['spec-options', 'spec-chip'], ['quantity-controls', 'quantity-action']])('keeps disabled %s controls readable against Skyline native default rules', (parent, control) => {
  expect(buttonStyle('pages/product/index.wxss', `<view class="${parent}"><button class="${control} is-disabled wx-button-disabled wx-button-type-default" disabled>不可选</button></view>`)).toMatchObject({ color: '#666', background: '#eee', opacity: '1', disabled: true, clicks: 0 });
});
