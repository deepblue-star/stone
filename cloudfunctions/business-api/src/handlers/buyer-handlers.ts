import type * as C from '../../../../packages/contracts/src/index';
import type { DesignService } from '../../../../packages/backend/src/services/design-service';
import type { CartService } from '../../../../packages/backend/src/services/cart-service';
import type { AddressService } from '../../../../packages/backend/src/services/address-service';
export class SaveDesignHandler { constructor(private readonly service: DesignService) {} handle(payload: C.SaveDesignPayload, identity: C.TrustedIdentity) { return this.service.saveDesign(payload, identity); } }
export class ListDesignsHandler { constructor(private readonly service: DesignService) {} handle(payload: C.BuyerPagePayload, identity: C.TrustedIdentity) { return this.service.listDesigns(payload, identity); } }
export class ListDesignVersionsHandler { constructor(private readonly service: DesignService) {} handle(payload: C.ListDesignVersionsPayload, identity: C.TrustedIdentity) { return this.service.listDesignVersions(payload, identity); } }
export class GetDesignVersionHandler { constructor(private readonly service: DesignService) {} handle(payload: C.DesignVersionPayload, identity: C.TrustedIdentity) { return this.service.getDesignVersion(payload, identity); } }
export class CopyDesignHandler { constructor(private readonly service: DesignService) {} handle(payload: C.CopyDesignPayload, identity: C.TrustedIdentity) { return this.service.copyDesign(payload, identity); } }
export class GetCartHandler { constructor(private readonly service: CartService) {} handle(payload: Record<string, never>, identity: C.TrustedIdentity) { return this.service.getCart(payload, identity); } }
export class AddCartItemHandler { constructor(private readonly service: CartService) {} handle(payload: C.AddCartItemPayload, identity: C.TrustedIdentity) { return this.service.addCartItem(payload, identity); } }
export class UpdateCartItemHandler { constructor(private readonly service: CartService) {} handle(payload: C.UpdateCartItemPayload, identity: C.TrustedIdentity) { return this.service.updateCartItem(payload, identity); } }
export class DeleteCartItemHandler { constructor(private readonly service: CartService) {} handle(payload: C.CartItemPayload, identity: C.TrustedIdentity) { return this.service.deleteCartItem(payload, identity); } }
export class ListAddressesHandler { constructor(private readonly service: AddressService) {} handle(payload: Record<string, never>, identity: C.TrustedIdentity) { return this.service.listAddresses(payload, identity); } }
export class SaveAddressHandler { constructor(private readonly service: AddressService) {} handle(payload: C.SaveAddressPayload, identity: C.TrustedIdentity) { return this.service.saveAddress(payload, identity); } }
export class SetDefaultAddressHandler { constructor(private readonly service: AddressService) {} handle(payload: C.AddressPayload, identity: C.TrustedIdentity) { return this.service.setDefaultAddress(payload, identity); } }
export class DeleteAddressHandler { constructor(private readonly service: AddressService) {} handle(payload: C.AddressPayload, identity: C.TrustedIdentity) { return this.service.deleteAddress(payload, identity); } }
