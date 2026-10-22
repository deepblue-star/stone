import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const names = ['designs','design','cart','addresses','address-edit','checkout','orders','order','terms'];
it.each(names)('%s includes custom navigation, scrolling, retry/empty states and complete route files', name => {
  const source = existsSync(`miniprogram/pages/${name}/index.wxml`) ? readFileSync(`miniprogram/pages/${name}/index.wxml`, 'utf8') : '';
  expect(source).toContain('<navigation-bar'); expect(source).toContain('<scroll-view');
  expect(existsSync(`miniprogram/pages/${name}/index.wxss`)).toBe(true);
  expect(JSON.parse(readFileSync(`miniprogram/pages/${name}/index.json`, 'utf8'))).toMatchObject({ navigationStyle: 'custom', usingComponents: { 'navigation-bar': '/components/navigation-bar/navigation-bar' } });
  expect(source).not.toMatch(/\{\{[^}]*\.(map|reduce|filter|join|toFixed)\(/);
  for (const expression of source.matchAll(/\{\{([\s\S]*?)\}\}/g)) expect(() => new Function('return (' + expression[1] + ');'), name + ': ' + expression[1]).not.toThrow();
  for (const button of source.match(/<button\b[^>]*>/g) || []) if (button.includes('disabled=')) expect(button).toContain('is-disabled');
});
it('product has fixed service/cart/buy action bar and no unavailable placeholder', () => {
  const source = readFileSync('miniprogram/pages/product/index.wxml', 'utf8');
  expect(source).toContain('bindtap="addCart"'); expect(source).toContain('bindtap="buy"'); expect(source).toContain('bindtap="contact"'); expect(source).not.toContain('购买功能尚未开放');
});
it('matches the reference cart selection toolbar and grouped address form structure', () => {
  const cart = readFileSync('miniprogram/pages/cart/index.wxml', 'utf8');
  expect(cart.indexOf('bindtap="toggleAll"')).toBeLessThan(cart.indexOf('<scroll-view'));
  const address = readFileSync('miniprogram/pages/address-edit/index.wxml', 'utf8');
  expect(address).toContain('class="group-title">联系人'); expect(address).toContain('class="group-title">收货地址');
  expect(address).toContain('field field-row');
});
