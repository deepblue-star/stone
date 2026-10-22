import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('opens home and provides exactly the four agreed tabs', () => {
  const app = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
  expect(app.pages[0]).toBe('pages/home/index');
  expect(app.tabBar.list.map((item: { text: string }) => item.text)).toEqual(['首页', '好物', 'DIY', '我的']);
  for (const item of app.tabBar.list) {
    expect(app.pages).toContain(item.pagePath);
    for (const ext of ['js', 'json', 'wxml', 'wxss']) expect(existsSync(`miniprogram/${item.pagePath}.${ext}`)).toBe(true);
  }
});

it('preserves category landing, separate result page, and DIY starting page', () => {
  const catalog = readFileSync('miniprogram/pages/catalog/index.wxml', 'utf8');
  expect(catalog).toContain('bindconfirm="search"');
  expect(catalog).toContain('bindtap="openCategory"');
  expect(catalog).not.toContain('THE STONE COLLECTION');
  expect(catalog).not.toContain('开发联通检查');
  const products = readFileSync('miniprogram/pages/products/index.wxml', 'utf8');
  expect(products).toContain('product-row');
  expect(products).toContain('bindtap="openItem"');
  const diy = readFileSync('miniprogram/pages/diy/index.wxml', 'utf8');
  expect(diy).toContain('我的设计');
  expect(diy).toContain('继续设计');
  expect(diy).toContain('手串定制');
});

it('all registered WXML expressions and controllers are syntactically valid', () => {
  const app = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
  for (const path of app.pages as string[]) {
    const template = readFileSync(`miniprogram/${path}.wxml`, 'utf8');
    for (const expression of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      expect(() => new Function(`return (${expression[1]});`), `${path}: ${expression[1]}`).not.toThrow();
    }
    expect(() => new Function('Page', 'require', 'wx', readFileSync(`miniprogram/${path}.js`, 'utf8')), path).not.toThrow();
  }
});
