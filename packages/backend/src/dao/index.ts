import type { DatabaseExecutor } from "../db/database";
import { SiteConfigDAO } from "./site-config-dao";
import { AdminDAO } from "./admin-dao";
import { PointsAccountDAO } from "./points-account-dao";
import { PointsLedgerDAO } from "./points-ledger-dao";
import { DesignDAO } from "./design-dao";
import { DesignVersionDAO } from "./design-version-dao";
import { CartDAO } from "./cart-dao";
import { AddressDAO } from "./address-dao";
import { OrderDAO } from "./order-dao";
import { OrderItemDAO } from "./order-item-dao";
import { PaymentDAO } from "./payment-dao";
import { PaymentReconciliationRunDAO } from "./payment-reconciliation-run-dao";
import { PaymentReconciliationIssueDAO } from "./payment-reconciliation-issue-dao";
import { ReferralRelationDAO } from "./referral-relation-dao";
import { CategoryDAO } from "../catalog/category-dao";
import { CatalogItemDAO } from "../catalog/catalog-item-dao";
import { SkuDAO } from "../catalog/sku-dao";
import { ReservationDAO } from "../catalog/reservation-dao";
import { InventoryMovementDAO } from "../catalog/inventory-movement-dao";
import { SkuCouponDAO } from "../catalog/sku-coupon-dao";
export * from "./site-config-dao";
export * from "./admin-dao";
export * from "./points-account-dao";
export * from "./points-ledger-dao";
export * from "./design-dao";
export * from "./design-version-dao";
export * from "./cart-dao";
export * from "./address-dao";
export * from "./order-dao";
export * from "./order-item-dao";
export * from "./payment-dao";
export * from "./payment-reconciliation-run-dao";
export * from "./payment-reconciliation-issue-dao";
export * from "./referral-relation-dao";
export * from "./types";
export * from "../catalog/category-dao";
export * from "../catalog/catalog-item-dao";
export * from "../catalog/sku-dao";
export * from "../catalog/reservation-dao";
export * from "../catalog/inventory-movement-dao";
export * from "../catalog/sku-coupon-dao";
export type {
  CategoryRow,
  ItemRow,
  SkuRow,
  CouponRow,
  MovementRow,
} from "../catalog/dao";
export function createDaos(executor: DatabaseExecutor) {
  return {
    siteConfig: new SiteConfigDAO(executor),
    admin: new AdminDAO(executor),
    pointsAccounts: new PointsAccountDAO(executor),
    pointsLedger: new PointsLedgerDAO(executor),
    categories: new CategoryDAO(executor),
    items: new CatalogItemDAO(executor),
    skus: new SkuDAO(executor),
    designs: new DesignDAO(executor),
    designVersions: new DesignVersionDAO(executor),
    cart: new CartDAO(executor),
    addresses: new AddressDAO(executor),
    orders: new OrderDAO(executor),
    orderItems: new OrderItemDAO(executor),
    payments: new PaymentDAO(executor),
    reconciliationRuns: new PaymentReconciliationRunDAO(executor),
    reconciliationIssues: new PaymentReconciliationIssueDAO(executor),
    reservations: new ReservationDAO(executor),
    inventoryMovements: new InventoryMovementDAO(executor),
    referrals: new ReferralRelationDAO(executor),
    skuCoupons: new SkuCouponDAO(executor),
  };
}
export type DaoSet = ReturnType<typeof createDaos>;
