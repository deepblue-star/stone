import type { CatalogType } from "../../../contracts/src/catalog";
import { PointsAccountDAO } from "../dao/points-account-dao";
import { PointsLedgerDAO } from "../dao/points-ledger-dao";
import type { DatabaseExecutor } from "../db/database";
import { CategoryDAO } from "./category-dao";
import { CatalogItemDAO } from "./catalog-item-dao";
import { SkuDAO } from "./sku-dao";
import { ReservationDAO } from "./reservation-dao";
import { InventoryMovementDAO } from "./inventory-movement-dao";
import { SkuCouponDAO } from "./sku-coupon-dao";
export {
  CategoryDAO,
  CatalogItemDAO,
  SkuDAO,
  ReservationDAO,
  InventoryMovementDAO,
  SkuCouponDAO,
};

export interface CategoryRow {
  id: string;
  catalog_type: CatalogType;
  name: string;
  sort_order: number;
  is_enabled: number;
  is_deleted: number;
  updated_at: Date | string;
  item_count?: number | string;
}
export interface ItemRow {
  id: string;
  category_id: string;
  catalog_type: CatalogType;
  name: string;
  description: string | null;
  images: unknown;
  spec_schema: unknown;
  is_on_sale: number;
  is_deleted: number;
  updated_at: Date | string;
  sku_count?: number | string;
  stock_total?: number | string;
  stock_reserved?: number | string;
  min_price_cent?: number | string | null;
  has_available_sku?: number;
}
export interface SkuRow {
  id: string;
  item_id: string;
  spec_values: unknown;
  spec_signature: string | null;
  diameter_mm: number | string | null;
  image_file_id: string | null;
  price_cent: string | number;
  points_exchange_enabled: number;
  points_cost: number | null;
  stock_total: number;
  stock_reserved: number;
  is_on_sale: number;
  is_deleted: number;
  updated_at: Date | string;
}
export interface CouponRow {
  coupon_id: string;
  account_id: string;
  points_cost_snapshot: number;
  status: "AVAILABLE" | "LOCKED";
  _openid: string;
}
export interface MovementRow {
  id: string;
  event_key: string;
  sku_id: string;
  action: "ADMIN_ADJUST" | "RESERVE" | "CONSUME" | "RELEASE";
  stock_delta: number;
  reserved_delta: number;
  order_id: string | null;
  operator_uid: string | null;
  remark: string | null;
  created_at: Date | string;
}

export function createCatalogDaos(db: DatabaseExecutor) {
  return {
    categories: new CategoryDAO(db),
    items: new CatalogItemDAO(db),
    skus: new SkuDAO(db),
    reservations: new ReservationDAO(db),
    inventoryMovements: new InventoryMovementDAO(db),
    skuCoupons: new SkuCouponDAO(db),
    pointsAccounts: new PointsAccountDAO(db),
    pointsLedger: new PointsLedgerDAO(db),
  };
}
export type CatalogDaos = ReturnType<typeof createCatalogDaos>;
