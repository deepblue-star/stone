import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
interface Component { sku_id: string }
interface Material { price_cent?: number; diameter_mm: number }
interface DesignModel {
  estimate(components: Component[], materials: Record<string, Material>, counts: Record<string, number>, quantity?: number): Record<string, unknown>;
  ringLayout(components: Component[], materials: Record<string, Material>, width: number, height: number): { x: number; y: number; size: number }[];
  move(components: Component[], from: number, to: number): Component[];
}
function model(): DesignModel { const module = { exports: {} }; runInNewContext(readFileSync('miniprogram/services/design-model.js', 'utf8'), { module }); return module.exports as DesignModel; }

it('applies coupon counts locally without consuming rights across separate designs', () => {
  const materials = { '1': { price_cent: 300, diameter_mm: 8 }, '2': { price_cent: 500, diameter_mm: 10 } };
  const components = [{ sku_id: '1' }, { sku_id: '1' }, { sku_id: '2' }];
  expect(model().estimate(components, materials, { '1': 1 })).toMatchObject({ priceCent: 800, perimeterCm: 2.6, freeCounts: { '1': 1 }, remainingFree: { '1': 0 } });
  expect(model().estimate([{ sku_id: '1' }], materials, { '1': 1 })).toMatchObject({ priceCent: 0, freeCounts: { '1': 1 } });
  expect(components).toEqual([{ sku_id: '1' }, { sku_id: '1' }, { sku_id: '2' }]);
});

it('does not turn missing material prices into a free design', () => {
  expect(model().estimate([{ sku_id: '9' }], {}, {})).toMatchObject({ priceCent: null, unavailable: ['9'] });
});

it('multiplies component counts before allocating each coupon once without multiplying perimeter', () => {
  expect(model().estimate([{ sku_id: '1' }, { sku_id: '1' }], { '1': { price_cent: 500, diameter_mm: 8 } }, { '1': 1 }, 2)).toMatchObject({ priceCent: 1500, counts: { '1': 4 }, freeCounts: { '1': 1 }, perimeterCm: 1.6 });
});
it('marks overflow and invalid or negative current prices unknown', () => {
  expect(model().estimate([{ sku_id: '1' }], { '1': { price_cent: Number.MAX_SAFE_INTEGER, diameter_mm: 8 } }, {}, 2)).toMatchObject({ priceCent: null });
  expect(model().estimate([{ sku_id: '1' }], { '1': { price_cent: -1, diameter_mm: 8 } }, {}, 2)).toMatchObject({ priceCent: null });
});

it('lays out finite proportional bead positions and reorders without mutating source', () => {
  const items = [{ sku_id: '1' }, { sku_id: '2' }, { sku_id: '1' }];
  const positions = model().ringLayout(items, { '1': { diameter_mm: 8 }, '2': { diameter_mm: 12 } }, 320, 320);
  expect(positions).toHaveLength(3);
  expect(positions.every((p: {x:number;y:number;size:number}) => [p.x,p.y,p.size].every(Number.isFinite) && p.size > 0)).toBe(true);
  expect(model().move(items, 0, 2)).toEqual([{ sku_id: '2' }, { sku_id: '1' }, { sku_id: '1' }]);
  expect(items[0]).toEqual({ sku_id: '1' });
});
