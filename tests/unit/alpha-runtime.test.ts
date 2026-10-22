import { expect, it, vi } from 'vitest';
import { createBusinessApi } from '../../cloudfunctions/business-api/src/app';
import type { PointsServices } from '../../cloudfunctions/business-api/src/points-registry';
import type { SiteConfigService } from '../../packages/backend/src/services/site-config-service';
import { CheckoutChangedError } from '../../packages/backend/src/services/checkout-service';
import type { CheckoutQuote } from '../../packages/contracts/src/checkout';

it('wires the member module into business-api and resolves only trusted caller identity', async () => {
  const getProfileSummary = vi.fn(async () => ({ points: { invite_code: 'A7K2' } }));
  const resolveIdentity = vi.fn(async () => ({ kind: 'wechat' as const, openid: 'trusted-user' }));
  const services = { pointsService: {}, skuCouponService: {}, referralService: {}, profileService: { getProfileSummary } } as unknown as PointsServices;
  const api = createBusinessApi({ siteConfigService: {} as SiteConfigService, pointsServices: services, resolveIdentity, log() {} });
  expect(await api({ action: 'getProfileSummary', payload: {} }, {})).toMatchObject({ ok: true, data: { points: { invite_code: 'A7K2' } } });
  expect(getProfileSummary).toHaveBeenCalledWith({}, { kind: 'wechat', openid: 'trusted-user' });
  resolveIdentity.mockClear();
  expect(await api({ action: 'getProfileSummary', payload: { openid: 'spoofed' } }, {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
  expect(resolveIdentity).not.toHaveBeenCalled();
});

it('returns the newly validated quote only for the explicit CHECKOUT_CHANGED failure', async () => {
  const quote = { items: [], address: { address_id: '1', receiver_name: '测试', phone_masked: '138****0000', full_address: '测试地址' }, goods_amount_cent: 100, discount_amount_cent: 0, shipping_fee_cent: 0, total_amount_cent: 100, quote_hash: 'fresh' } satisfies CheckoutQuote;
  const api = createBusinessApi({ siteConfigService: {} as SiteConfigService, actionRegistry: new Map([['createDirectOrder', { validate: (value: unknown) => value, async run() { throw new CheckoutChangedError(quote); } }]]), async resolveIdentity() { return { kind: 'anonymous' }; }, log() {} });
  expect(await api({ action: 'createDirectOrder', payload: {} }, {})).toMatchObject({ ok: false, code: 'CHECKOUT_CHANGED', data: quote });
});
