import { expect, it } from 'vitest';
import { alphaSeedDefinitions } from '../../scripts/seed-alpha-dev';
it('defines repeatable clearly marked development cases for bead coupons, accessories and STANDARD specs', () => {
  const definitions = alphaSeedDefinitions();
  expect(new Set(definitions.map(item => item.name)).size).toBe(definitions.length);
  expect(definitions.every(item => item.name.startsWith('【Alpha样例】'))).toBe(true);
  expect(definitions.some(item => item.type === 'BEAD' && item.pointsCost === 5)).toBe(true);
  expect(definitions.some(item => item.type === 'ACCESSORY' && item.pointsCost === null)).toBe(true);
  expect(definitions.some(item => item.type === 'STANDARD' && item.sizes.length > 1)).toBe(true);
});

it('assigns single-bead images to DIY fixtures instead of using an entire bracelet as each bead', () => {
  const definitions = alphaSeedDefinitions();
  expect(definitions.find(item => item.name === '【Alpha样例】净体白水晶')).toHaveProperty('imageAsset', 'white-quartz-bead-generated.png');
  expect(definitions.find(item => item.name === '【Alpha样例】草莓晶')).toHaveProperty('imageAsset', 'strawberry-quartz-bead-generated.png');
  expect(definitions.find(item => item.type === 'ACCESSORY')).toHaveProperty('imageAsset', 'gold-spacer-bead-generated.png');
  expect(definitions.find(item => item.type === 'STANDARD')).toHaveProperty('imageAsset', 'quartz-bracelet-generated.png');
});
