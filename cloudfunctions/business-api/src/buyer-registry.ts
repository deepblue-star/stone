import type { TrustedIdentity } from '../../../packages/contracts/src/index';
import type { DesignService } from '../../../packages/backend/src/services/design-service';
import type { CartService } from '../../../packages/backend/src/services/cart-service';
import type { AddressService } from '../../../packages/backend/src/services/address-service';
import { validateBuyerPayload } from '../../../packages/backend/src/services/buyer-rules';
import type { RegisteredAction } from './action-registry';
import * as H from './handlers/buyer-handlers';
export interface BuyerServices { designService: DesignService; cartService: CartService; addressService: AddressService }
export function createBuyerActions(services: BuyerServices): [string, RegisteredAction][] {
  function trusted<P>(action: string, handler: { handle(payload: P, identity: TrustedIdentity): Promise<unknown> }): [string, RegisteredAction] { return [action, { validate: payload => validateBuyerPayload(action, payload), async run(payload, resolveIdentity) { return handler.handle(validateBuyerPayload(action, payload) as P, await resolveIdentity()); } }]; }
  return [trusted('saveDesign', new H.SaveDesignHandler(services.designService)), trusted('listDesigns', new H.ListDesignsHandler(services.designService)), trusted('listDesignVersions', new H.ListDesignVersionsHandler(services.designService)), trusted('getDesignVersion', new H.GetDesignVersionHandler(services.designService)), trusted('copyDesign', new H.CopyDesignHandler(services.designService)), trusted('getCart', new H.GetCartHandler(services.cartService)), trusted('addCartItem', new H.AddCartItemHandler(services.cartService)), trusted('updateCartItem', new H.UpdateCartItemHandler(services.cartService)), trusted('deleteCartItem', new H.DeleteCartItemHandler(services.cartService)), trusted('listAddresses', new H.ListAddressesHandler(services.addressService)), trusted('saveAddress', new H.SaveAddressHandler(services.addressService)), trusted('setDefaultAddress', new H.SetDefaultAddressHandler(services.addressService)), trusted('deleteAddress', new H.DeleteAddressHandler(services.addressService))];
}
