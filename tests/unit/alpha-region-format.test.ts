import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
function load(path: string): Record<string, (...args: unknown[]) => unknown> { const module = { exports: {} }; runInNewContext(readFileSync(path, 'utf8'), { module }); return module.exports as Record<string, (...args: unknown[]) => unknown>; }
it('formats exact cent strings without rounding unsafe integer amounts', () => {
  const f = load('miniprogram/services/format.js');
  expect(f.money!('9007199254740993')).toBe('90071992547409.93');
  expect(f.money!(5)).toBe('0.05');
  expect(f.money!(null)).toBe('—');
});
it('restricts province selection to shipping configuration and supports municipalities', () => {
  const f = load('miniprogram/services/region-model.js');
  const data = [{ code: '110000', name: '北京市', children: [{ code: '110101', name: '东城区' }] }, { code: '440000', name: '广东省', children: [{ code: '440300', name: '深圳市', children: [{ code: '440305', name: '南山区' }] }] }];
  const state = f.regionState!(data, [{ province_code: '440000', province_name: '广东省' }], [0,0,0]) as { ranges: string[][]; value: Record<string, string> };
  expect(state.ranges).toEqual([['广东省'],['深圳市'],['南山区']]);
  expect(state.value).toMatchObject({ province_code: '440000', city_code: '440300', district_code: '440305' });
  const city = f.regionState!(data, [{ province_code: '110000', province_name: '北京市' }], [0,0,0]) as { value: Record<string,string> };
  expect(city.value).toMatchObject({ province_code: '110000', city_code: '110100', district_code: '110101' });
});
