import type { TrustedIdentity } from "../../../packages/contracts/src/index";
import type { CheckoutService } from "../../../packages/backend/src/services/checkout-service";
import type { OrderService } from "../../../packages/backend/src/services/order-service";
import { validateTransactionPayload } from "../../../packages/backend/src/services/transaction-rules";
import type { RegisteredAction } from "./action-registry";
import * as H from "./handlers/transaction-handlers";
export interface TransactionServices {
  checkoutService: CheckoutService;
  orderService: OrderService;
}
export function createTransactionActions(
  services: TransactionServices,
): [string, RegisteredAction][] {
  function trusted<P>(
    action: string,
    handler: {
      handle(payload: P, identity: TrustedIdentity): Promise<unknown>;
    },
  ): [string, RegisteredAction] {
    return [
      action,
      {
        validate: (payload) => validateTransactionPayload(action, payload),
        async run(payload, identity) {
          return handler.handle(
            validateTransactionPayload(action, payload) as P,
            await identity(),
          );
        },
      },
    ];
  }
  return [
    trusted(
      "previewOrderFromCart",
      new H.PreviewOrderFromCartHandler(services.checkoutService),
    ),
    trusted(
      "previewDirectOrder",
      new H.PreviewDirectOrderHandler(services.checkoutService),
    ),
    trusted(
      "createOrderFromCart",
      new H.CreateOrderFromCartHandler(services.checkoutService),
    ),
    trusted(
      "createDirectOrder",
      new H.CreateDirectOrderHandler(services.checkoutService),
    ),
    trusted("listMyOrders", new H.ListMyOrdersHandler(services.orderService)),
    trusted(
      "getMyOrderDetail",
      new H.GetMyOrderDetailHandler(services.orderService),
    ),
    trusted(
      "listAdminOrders",
      new H.ListAdminOrdersHandler(services.orderService),
    ),
    trusted(
      "getAdminOrderDetail",
      new H.GetAdminOrderDetailHandler(services.orderService),
    ),
    trusted("shipOrder", new H.ShipOrderHandler(services.orderService)),
    trusted("completeOrder", new H.CompleteOrderHandler(services.orderService)),
  ];
}
