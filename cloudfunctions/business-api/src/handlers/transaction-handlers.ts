import type * as C from "../../../../packages/contracts/src/index";
import type { CheckoutService } from "../../../../packages/backend/src/services/checkout-service";
import type { OrderService } from "../../../../packages/backend/src/services/order-service";
export class PreviewOrderFromCartHandler {
  constructor(private readonly service: CheckoutService) {}
  handle(p: C.PreviewOrderFromCartPayload, i: C.TrustedIdentity) {
    return this.service.previewOrderFromCart(p, i);
  }
}
export class PreviewDirectOrderHandler {
  constructor(private readonly service: CheckoutService) {}
  handle(p: C.PreviewDirectOrderPayload, i: C.TrustedIdentity) {
    return this.service.previewDirectOrder(p, i);
  }
}
export class CreateOrderFromCartHandler {
  constructor(private readonly service: CheckoutService) {}
  handle(p: C.CreateOrderFromCartPayload, i: C.TrustedIdentity) {
    return this.service.createOrderFromCart(p, i);
  }
}
export class CreateDirectOrderHandler {
  constructor(private readonly service: CheckoutService) {}
  handle(p: C.CreateDirectOrderPayload, i: C.TrustedIdentity) {
    return this.service.createDirectOrder(p, i);
  }
}
export class ListMyOrdersHandler {
  constructor(private readonly service: OrderService) {}
  handle(p: C.ListMyOrdersPayload, i: C.TrustedIdentity) {
    return this.service.listMyOrders(p, i);
  }
}
export class GetMyOrderDetailHandler {
  constructor(private readonly service: OrderService) {}
  handle(p: C.OrderNoPayload, i: C.TrustedIdentity) {
    return this.service.getMyOrderDetail(p, i);
  }
}
export class ListAdminOrdersHandler {
  constructor(private readonly service: OrderService) {}
  handle(p: C.ListAdminOrdersPayload, i: C.TrustedIdentity) {
    return this.service.listAdminOrders(p, i);
  }
}
export class GetAdminOrderDetailHandler {
  constructor(private readonly service: OrderService) {}
  handle(p: C.OrderNoPayload, i: C.TrustedIdentity) {
    return this.service.getAdminOrderDetail(p, i);
  }
}
export class ShipOrderHandler {
  constructor(private readonly service: OrderService) {}
  handle(p: C.ShipOrderPayload, i: C.TrustedIdentity) {
    return this.service.shipOrder(p, i);
  }
}
export class CompleteOrderHandler {
  constructor(private readonly service: OrderService) {}
  handle(p: C.OrderNoPayload, i: C.TrustedIdentity) {
    return this.service.completeOrder(p, i);
  }
}
