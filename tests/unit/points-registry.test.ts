import { expect, it, vi } from 'vitest';
import { createPointsActions, type PointsServices } from '../../cloudfunctions/business-api/src/points-registry';
it('registers only public actions and rejects forged identity/amount fields', async () => {
  const get = vi.fn(async () => ({ balance: '0' }));
  const services = { pointsService: { getPointsCenter: get }, referralService: {}, profileService: {}, skuCouponService: {} } as unknown as PointsServices;
  const actions = new Map(createPointsActions(services));
  expect(actions.size).toBe(10);
  expect(actions.has('ensureAccount')).toBe(false);
  expect(actions.has('grantFirstCompletedOrderReward')).toBe(false);
  expect(() => actions.get('dailyCheckIn')!.validate({ awarded_points: 999 })).toThrow();
  expect(() => actions.get('getPointsCenter')!.validate({ openid: 'other' })).toThrow();
  expect(() => actions.get('bindReferrer')!.validate({ invite_code: 'abcd', bind_channel: 'MANUAL_CODE' })).toThrow();
  const identity = { kind: 'wechat' as const, openid: 'user' };
  await actions.get('getPointsCenter')!.run({}, async () => identity);
  expect(get).toHaveBeenCalledWith({}, identity);
});
