import { describe, expect, it, vi } from 'vitest';
import { buyerFixture } from '../helpers/buyer-fixture';
import { createBuyerActions } from '../../cloudfunctions/business-api/src/buyer-registry';
describe('buyer registry', () => {
  it('registers documented design, cart and address actions with validation before identity', async () => {
    const f = buyerFixture(); const actions = new Map(createBuyerActions({ designService: f.design, cartService: f.cart, addressService: f.address }));
    expect([...actions.keys()]).toEqual(['saveDesign','listDesigns','listDesignVersions','getDesignVersion','copyDesign','getCart','addCartItem','updateCartItem','deleteCartItem','listAddresses','saveAddress','setDefaultAddress','deleteAddress']);
    const identity = vi.fn(async () => ({ kind: 'wechat' as const, openid: 'user' }));
    expect(() => actions.get('saveDesign')!.validate({ name: 'x', components: [], _openid: 'other' })).toThrow();
    await expect(actions.get('getCart')!.run({ _openid: 'other' }, identity)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' }); expect(identity).not.toHaveBeenCalled();
    expect(await actions.get('getCart')!.run({}, identity)).toMatchObject({ items: [] }); expect(identity).toHaveBeenCalledTimes(1);
  });
});
