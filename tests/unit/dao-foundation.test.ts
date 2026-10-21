import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createDaos } from "../../packages/backend/src/dao";
import { createCatalogDaos } from "../../packages/backend/src/catalog/dao";
import type {
  DatabaseExecutor,
  SqlParameter,
} from "../../packages/backend/src/db/database";
import type { DatabaseConnection } from "../../packages/backend/src/db/database";
import { UnitOfWork } from "../../packages/backend/src/db/unit-of-work";

const hostile = "x' OR 1=1 --";
const big = "18446744073709551614";
const time = "2026-10-22 00:00:00";
const address = {
  receiver_name: hostile,
  phone: "123",
  province_code: "110000",
  province: "P",
  city_code: "110100",
  city: "C",
  district_code: "110101",
  district: "D",
  address_line: "A",
  is_default: 1,
};
const order = {
  order_no: hostile,
  _openid: "owner",
  checkout_key: "key",
  checkout_request_hash: "hash",
  quote_hash: "quote",
  payment_mode: "WECHAT",
  status: "PENDING_PAYMENT",
  goods_amount_cent: big,
  discount_amount_cent: "0",
  shipping_fee_cent: "0",
  total_amount_cent: big,
  address_snapshot: { phone: hostile },
  payment_deadline_at: time,
  paid_at: null,
  carrier_name: null,
  tracking_no: null,
  shipped_at: null,
  completed_at: null,
  closed_at: null,
};
const line = {
  order_id: big,
  item_type: "STANDARD",
  sku_id: big,
  design_version_id: null,
  quantity: 2,
  unit_price_cent: big,
  gross_amount_cent: big,
  discount_amount_cent: "0",
  line_amount_cent: big,
  item_snapshot: { name: hostile },
  promotion_snapshot: null,
};
const movement = {
  event_key: hostile,
  sku_id: big,
  order_id: big,
  action: "RESERVE",
  stock_delta: 0,
  reserved_delta: 2,
  operator_uid: null,
  remark: null,
};
const coupon = {
  account_id: big,
  sku_id: big,
  source_type: hostile,
  source_ref: null,
  points_cost_snapshot: 20,
  event_key: hostile,
  status: "AVAILABLE",
  locked_order_id: null,
  locked_at: null,
  used_order_id: null,
  used_at: null,
  refunded_at: null,
  refund_reason: null,
};
const capturedSql: { sql: string; params: readonly SqlParameter[] }[] = [];
afterAll(() => {
  if (process.env.STONE_DAO_CAPTURE_SQL === "1") {
    mkdirSync(".local", { recursive: true });
    writeFileSync(
      ".local/dao-captured-sql.json",
      JSON.stringify(capturedSql, null, 2),
    );
  }
});
class Recorder implements DatabaseExecutor {
  calls: { sql: string; params: readonly SqlParameter[] }[] = [];
  rows: readonly unknown[] = [];
  affectedRows = 0;
  async query<T>(
    sql: string,
    params: readonly SqlParameter[] = [],
  ): Promise<readonly T[]> {
    this.calls.push({ sql, params });
    capturedSql.push({ sql, params });
    return this.rows as readonly T[];
  }
  async execute(sql: string, params: readonly SqlParameter[] = []) {
    this.calls.push({ sql, params });
    capturedSql.push({ sql, params });
    return { affectedRows: this.affectedRows, insertId: big };
  }
}
type DynamicDao = Record<string, unknown>;
async function invoke(
  dao: DynamicDao,
  method: string,
  args: readonly unknown[],
): Promise<unknown> {
  const callable: unknown = Reflect.get(dao, method);
  if (typeof callable !== "function")
    throw new Error(`Missing DAO method ${method}`);
  return Reflect.apply(callable, dao, args);
}
function setup(key: string) {
  const db = new Recorder();
  const keys: Record<string, string> = {
    paymentReconciliationRuns: "reconciliationRuns",
    paymentReconciliationIssues: "reconciliationIssues",
    referralRelations: "referrals",
  };
  return {
    db,
    dao: (createDaos(db) as unknown as Record<string, DynamicDao>)[
      keys[key] ?? key
    ]!,
  };
}
function sql(db: Recorder, pattern: RegExp, params: readonly SqlParameter[]) {
  expect(db.calls).toHaveLength(1);
  expect(db.calls[0]!.sql).toMatch(pattern);
  expect(db.calls[0]!.params).toEqual(params);
  expect(db.calls[0]!.sql).not.toContain(hostile);
}

describe("complete executor-bound DAO foundation", () => {
  it("constructs exactly twenty concrete DAOs and preserves the catalog eight", () => {
    const db = new Recorder();
    expect(Object.keys(createDaos(db)).sort()).toEqual(
      [
        "siteConfig",
        "admin",
        "pointsAccounts",
        "pointsLedger",
        "categories",
        "items",
        "skus",
        "designs",
        "designVersions",
        "cart",
        "addresses",
        "orders",
        "orderItems",
        "payments",
        "reconciliationRuns",
        "reconciliationIssues",
        "reservations",
        "inventoryMovements",
        "referrals",
        "skuCoupons",
      ].sort(),
    );
    expect(Object.keys(createCatalogDaos(db)).sort()).toEqual(
      [
        "categories",
        "items",
        "skus",
        "reservations",
        "inventoryMovements",
        "skuCoupons",
        "pointsAccounts",
        "pointsLedger",
      ].sort(),
    );
    expect(
      Object.values(createDaos(db)).map((dao) => dao.constructor.name),
    ).toEqual([
      "SiteConfigDAO",
      "AdminDAO",
      "PointsAccountDAO",
      "PointsLedgerDAO",
      "CategoryDAO",
      "CatalogItemDAO",
      "SkuDAO",
      "DesignDAO",
      "DesignVersionDAO",
      "CartDAO",
      "AddressDAO",
      "OrderDAO",
      "OrderItemDAO",
      "PaymentDAO",
      "PaymentReconciliationRunDAO",
      "PaymentReconciliationIssueDAO",
      "ReservationDAO",
      "InventoryMovementDAO",
      "ReferralRelationDAO",
      "SkuCouponDAO",
    ]);
  });
  it.each([
    [
      "designs",
      "findByOwnerId",
      [hostile, big, true],
      /FROM designs WHERE _openid=\? AND id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [hostile, big],
    ],
    [
      "cart",
      "updateQuantity",
      [hostile, big, 2],
      /UPDATE cart_items SET quantity=\?,updated_at=UTC_TIMESTAMP\(\) WHERE _openid=\? AND id=\? AND is_deleted=0$/,
      [2, hostile, big],
    ],
    [
      "addresses",
      "clearDefault",
      [hostile],
      /UPDATE addresses SET is_default=0,updated_at=UTC_TIMESTAMP\(\) WHERE _openid=\? AND is_deleted=0$/,
      [hostile],
    ],
    [
      "orders",
      "findByOrderNo",
      [hostile, true],
      /FROM orders WHERE order_no=\? LIMIT 1 FOR UPDATE$/,
      [hostile],
    ],
    [
      "payments",
      "findByOutTradeNo",
      [hostile, true],
      /FROM payment_records WHERE out_trade_no=\? LIMIT 1 FOR UPDATE$/,
      [hostile],
    ],
    [
      "skus",
      "findBySpecSignature",
      [big, hostile],
      /FROM catalog_skus WHERE item_id=\? AND spec_signature=\? AND is_deleted=0 ORDER BY id LIMIT 1$/,
      [big, hostile],
    ],
    [
      "referralRelations",
      "recordReward",
      [big, hostile, "2026-10-22 00:00:00"],
      /WHERE id=\? AND rewarded_order_no IS NULL AND rewarded_at IS NULL AND is_deleted=0$/,
      [hostile, "2026-10-22 00:00:00", big],
    ],
  ])(
    "%s.%s binds SQL parameters",
    async (key, method, args, pattern, params) => {
      const { db, dao } = setup(key as string);
      await invoke(dao, method as string, args as unknown[]);
      sql(db, pattern as RegExp, params as SqlParameter[]);
    },
  );
  it.each([
    "designs",
    "designVersions",
    "orders",
    "payments",
    "pointsAccounts",
    "categories",
    "items",
    "skus",
    "skuCoupons",
  ])("%s empty batch does not query", async (key) => {
    const { db, dao } = setup(key);
    expect(await invoke(dao, "findByIds", [[]])).toEqual([]);
    expect(db.calls).toEqual([]);
  });

  const cases: [string, string, unknown[], RegExp, SqlParameter[]][] = [
    [
      "pointsAccounts",
      "updateBalance",
      [{ id: big, balance: "0", totalEarned: big, totalSpent: big }],
      /^UPDATE points_accounts SET balance = \?, total_earned = \?, total_spent = \? WHERE id = \? AND is_deleted = 0$/,
      ["0", big, big, big],
    ],
    [
      "skus",
      "updateSpec",
      [big, { color: hostile }, hostile],
      /^UPDATE catalog_skus SET spec_values=\?,spec_signature=\? WHERE id=\?$/,
      [JSON.stringify({ color: hostile }), hostile, big],
    ],
    [
      "skuCoupons",
      "markRefunded",
      [big, hostile, time],
      /^UPDATE user_sku_coupons SET status='REFUNDED',refunded_at=\?,refund_reason=\?,updated_at=UTC_TIMESTAMP\(\) WHERE id=\? AND status='AVAILABLE' AND is_deleted=0$/,
      [time, hostile, big],
    ],
    [
      "inventoryMovements",
      "insertAdjustment",
      [hostile, big, -3, "uid", hostile],
      /^INSERT INTO inventory_movements\(event_key,sku_id,action,stock_delta,reserved_delta,operator_uid,remark\) VALUES\(\?,\?,'ADMIN_ADJUST',\?,0,\?,\?\)$/,
      [hostile, big, -3, "uid", hostile],
    ],
    [
      "siteConfig",
      "upsert",
      [hostile, { x: hostile }, "uid"],
      /INSERT INTO site_config.*ON DUPLICATE KEY UPDATE/,
      [hostile, JSON.stringify({ x: hostile }), "uid"],
    ],
    [
      "admin",
      "insert",
      [{ auth_uid: hostile, display_name: "A", enabled: 1 }],
      /INSERT INTO admin_allowlist/,
      [hostile, "A", 1],
    ],
    [
      "admin",
      "findById",
      [big],
      /WHERE id=\? AND is_deleted=0 LIMIT 1$/,
      [big],
    ],
    [
      "admin",
      "findByAuthUid",
      [hostile],
      /WHERE auth_uid=\? AND is_deleted=0 LIMIT 1$/,
      [hostile],
    ],
    [
      "admin",
      "list",
      [{ enabled: false }, 10, 20],
      /WHERE is_deleted=0 AND enabled=\? ORDER BY id LIMIT \? OFFSET \?$/,
      [false, 10, 20],
    ],
    [
      "admin",
      "update",
      [big, { display_name: hostile, enabled: 0 }],
      /SET display_name=\?,enabled=\?.*WHERE id=\? AND is_deleted=0$/,
      [hostile, 0, big],
    ],
    [
      "admin",
      "softDelete",
      [big],
      /SET is_deleted=1.*WHERE id=\? AND is_deleted=0$/,
      [big],
    ],
    [
      "pointsAccounts",
      "findById",
      [big, true],
      /WHERE id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "pointsAccounts",
      "findByInviteCode",
      [hostile],
      /WHERE invite_code=\? AND is_deleted=0 LIMIT 1$/,
      [hostile],
    ],
    [
      "pointsAccounts",
      "findByIds",
      [[big, "2"], true],
      /WHERE id IN \(\?,\?\) AND is_deleted=0 ORDER BY id FOR UPDATE$/,
      [big, "2"],
    ],
    [
      "pointsAccounts",
      "updateBalanceIf",
      [{ id: big, balance: "0", totalEarned: big, totalSpent: big }, big],
      /SET balance = \?, total_earned = \?, total_spent = \?.*WHERE id = \? AND balance = \? AND is_deleted = 0$/,
      ["0", big, big, big, big],
    ],
    [
      "pointsLedger",
      "listByAccount",
      [big, { sourceType: hostile, sourceRef: hostile }, 10, 20],
      /WHERE account_id=\? AND is_deleted=0 AND source_type=\? AND source_ref=\? ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [big, hostile, hostile, 10, 20],
    ],
    [
      "pointsLedger",
      "sumByAccount",
      [big, { sourceType: hostile }],
      /CAST\(COALESCE\(SUM\(points_delta\),0\) AS CHAR\).*WHERE account_id=\? AND is_deleted=0 AND source_type=\?$/,
      [big, hostile],
    ],
    [
      "designs",
      "insert",
      [{ _openid: hostile, name: "N", current_version_no: 0 }],
      /INSERT INTO designs/,
      [hostile, "N", 0],
    ],
    [
      "designs",
      "findByIds",
      [[big], hostile],
      /WHERE id IN \(\?\) AND is_deleted=0 AND _openid=\? ORDER BY id$/,
      [big, hostile],
    ],
    [
      "designs",
      "listByOwner",
      [hostile, 10, 20],
      /WHERE _openid=\? AND is_deleted=0 ORDER BY updated_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [hostile, 10, 20],
    ],
    [
      "designs",
      "update",
      [hostile, big, { name: "N", current_version_no: 2 }],
      /SET name=\?,current_version_no=\?.*WHERE _openid=\? AND id=\? AND is_deleted=0$/,
      ["N", 2, hostile, big],
    ],
    [
      "designs",
      "softDelete",
      [hostile, big],
      /WHERE _openid=\? AND id=\? AND is_deleted=0$/,
      [hostile, big],
    ],
    [
      "designVersions",
      "insert",
      [
        {
          design_id: big,
          version_no: 1,
          components: [{ sku_id: big }],
          thumbnail_file_id: hostile,
        },
      ],
      /INSERT INTO design_versions/,
      [big, 1, JSON.stringify([{ sku_id: big }]), hostile],
    ],
    [
      "designVersions",
      "findById",
      [big],
      /WHERE id=\? AND is_deleted=0 LIMIT 1$/,
      [big],
    ],
    [
      "designVersions",
      "findByIds",
      [[big]],
      /WHERE id IN \(\?\) AND is_deleted=0 ORDER BY id$/,
      [big],
    ],
    [
      "designVersions",
      "findByDesignVersion",
      [big, 1],
      /WHERE design_id=\? AND version_no=\? AND is_deleted=0 LIMIT 1$/,
      [big, 1],
    ],
    [
      "designVersions",
      "listByDesign",
      [big, 10, 20],
      /WHERE design_id=\? AND is_deleted=0 ORDER BY version_no DESC,id DESC LIMIT \? OFFSET \?$/,
      [big, 10, 20],
    ],
    [
      "cart",
      "insert",
      [
        {
          _openid: hostile,
          item_type: "STANDARD",
          sku_id: big,
          design_version_id: null,
          quantity: 2,
        },
      ],
      /INSERT INTO cart_items/,
      [hostile, "STANDARD", big, null, 2],
    ],
    [
      "cart",
      "findByOwnerId",
      [hostile, big, true],
      /WHERE _openid=\? AND id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [hostile, big],
    ],
    [
      "cart",
      "listByOwner",
      [hostile, 10, 20],
      /WHERE _openid=\? AND is_deleted=0 ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [hostile, 10, 20],
    ],
    [
      "cart",
      "findSelected",
      [hostile, [big, "2"], true],
      /WHERE _openid=\? AND id IN \(\?,\?\) AND is_deleted=0 ORDER BY id FOR UPDATE$/,
      [hostile, big, "2"],
    ],
    [
      "cart",
      "findTarget",
      [
        hostile,
        { item_type: "STANDARD", sku_id: big, design_version_id: null },
        true,
        true,
      ],
      /WHERE _openid=\? AND item_type=\? AND sku_id <=> \? AND design_version_id <=> \? ORDER BY is_deleted,id LIMIT 1 FOR UPDATE$/,
      [hostile, "STANDARD", big, null],
    ],
    [
      "cart",
      "restore",
      [hostile, big, 3],
      /SET is_deleted=0,quantity=\?.*WHERE _openid=\? AND id=\? AND is_deleted=1$/,
      [3, hostile, big],
    ],
    [
      "cart",
      "softDelete",
      [hostile, big],
      /WHERE _openid=\? AND id=\? AND is_deleted=0$/,
      [hostile, big],
    ],
    [
      "cart",
      "softDeleteMany",
      [hostile, [big, "2"]],
      /WHERE _openid=\? AND id IN \(\?,\?\) AND is_deleted=0$/,
      [hostile, big, "2"],
    ],
    [
      "addresses",
      "insert",
      [{ _openid: hostile, ...address }],
      /INSERT INTO addresses/,
      [hostile, ...Object.values(address)],
    ],
    [
      "addresses",
      "findByOwnerId",
      [hostile, big],
      /WHERE _openid=\? AND id=\? AND is_deleted=0 LIMIT 1$/,
      [hostile, big],
    ],
    [
      "addresses",
      "findDefault",
      [hostile],
      /WHERE _openid=\? AND is_default=1 AND is_deleted=0 ORDER BY id LIMIT 1$/,
      [hostile],
    ],
    [
      "addresses",
      "listByOwner",
      [hostile, 10, 20],
      /WHERE _openid=\? AND is_deleted=0 ORDER BY is_default DESC,id DESC LIMIT \? OFFSET \?$/,
      [hostile, 10, 20],
    ],
    [
      "addresses",
      "update",
      [hostile, big, address],
      /SET receiver_name=\?.*WHERE _openid=\? AND id=\? AND is_deleted=0$/,
      [...Object.values(address), hostile, big],
    ],
    [
      "addresses",
      "setDefault",
      [hostile, big],
      /SET is_default=1.*WHERE _openid=\? AND id=\? AND is_deleted=0$/,
      [hostile, big],
    ],
    [
      "addresses",
      "softDelete",
      [hostile, big],
      /WHERE _openid=\? AND id=\? AND is_deleted=0$/,
      [hostile, big],
    ],
    [
      "orders",
      "insert",
      [order],
      /INSERT INTO orders/,
      [
        ...Object.values(order).map((v) =>
          typeof v === "object" && v !== null ? JSON.stringify(v) : v,
        ),
      ],
    ],
    [
      "orders",
      "findById",
      [big, true],
      /WHERE id=\? LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "orders",
      "findByIds",
      [[big], true],
      /WHERE id IN \(\?\) ORDER BY id FOR UPDATE$/,
      [big],
    ],
    [
      "orders",
      "findByOwnerId",
      [hostile, big, true],
      /WHERE _openid=\? AND id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [hostile, big],
    ],
    [
      "orders",
      "findByCheckoutKey",
      [hostile, "key", true],
      /WHERE _openid=\? AND checkout_key=\? LIMIT 1 FOR UPDATE$/,
      [hostile, "key"],
    ],
    [
      "orders",
      "listByOwner",
      [hostile, { status: "CLOSED" }, 10, 20],
      /WHERE is_deleted=0 AND _openid=\? AND status=\? ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [hostile, "CLOSED", 10, 20],
    ],
    [
      "orders",
      "listAdmin",
      [
        {
          status: "CLOSED",
          orderNo: hostile,
          openid: hostile,
          createdFrom: time,
          createdTo: time,
        },
        10,
        20,
      ],
      /WHERE is_deleted=0 AND _openid=\? AND status=\? AND order_no=\? AND created_at>=\? AND created_at<=\? ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [hostile, "CLOSED", hostile, time, time, 10, 20],
    ],
    [
      "orders",
      "countByStatus",
      [hostile],
      /WHERE is_deleted=0 AND _openid=\? GROUP BY status$/,
      [hostile],
    ],
    [
      "orders",
      "scanPending",
      [time, 10],
      /WHERE status=\? AND created_at>=\? ORDER BY created_at,id LIMIT \?$/,
      ["PENDING_PAYMENT", time, 10],
    ],
    [
      "orders",
      "scanDeadline",
      [time, 10],
      /WHERE status=\? AND payment_deadline_at<=\? ORDER BY payment_deadline_at,id LIMIT \?$/,
      ["PENDING_PAYMENT", time, 10],
    ],
    [
      "orders",
      "updateState",
      [
        big,
        "PENDING_PAYMENT",
        {
          status: "READY_TO_SHIP",
          paid_at: time,
          shipped_at: null,
          completed_at: null,
          closed_at: null,
        },
      ],
      /SET status=\?,paid_at=\?,shipped_at=\?,completed_at=\?,closed_at=\?.*WHERE id=\? AND status=\?$/,
      ["READY_TO_SHIP", time, null, null, null, big, "PENDING_PAYMENT"],
    ],
    [
      "orders",
      "updateShipment",
      [
        big,
        "READY_TO_SHIP",
        {
          status: "SHIPPED",
          carrier_name: hostile,
          tracking_no: "T",
          shipped_at: time,
        },
      ],
      /SET status=\?,carrier_name=\?,tracking_no=\?,shipped_at=\?.*WHERE id=\? AND status=\?$/,
      ["SHIPPED", hostile, "T", time, big, "READY_TO_SHIP"],
    ],
    [
      "orderItems",
      "insert",
      [line],
      /INSERT INTO order_items/,
      Object.values(line).map((v) =>
        typeof v === "object" && v !== null ? JSON.stringify(v) : v,
      ),
    ],
    [
      "orderItems",
      "insertMany",
      [[line, line]],
      /INSERT INTO order_items.*VALUES \(\?(,\?){10}\),\(\?(,\?){10}\)$/,
      [...Object.values(line), ...Object.values(line)].map((v) =>
        typeof v === "object" && v !== null ? JSON.stringify(v) : v,
      ),
    ],
    [
      "orderItems",
      "listByOrder",
      [big],
      /WHERE order_id=\? AND is_deleted=0 ORDER BY id$/,
      [big],
    ],
    [
      "orderItems",
      "listByOrderIds",
      [[big, "2"]],
      /WHERE order_id IN \(\?,\?\) AND is_deleted=0 ORDER BY order_id,id$/,
      [big, "2"],
    ],
    [
      "payments",
      "insert",
      [
        {
          order_id: big,
          out_trade_no: hostile,
          prepay_id: null,
          transaction_id: null,
          trade_state: null,
          success_time: null,
        },
      ],
      /INSERT INTO payment_records/,
      [big, hostile, null, null, null, null],
    ],
    [
      "payments",
      "findById",
      [big, true],
      /WHERE id=\? LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "payments",
      "findByIds",
      [[big], true],
      /WHERE id IN \(\?\) ORDER BY id FOR UPDATE$/,
      [big],
    ],
    [
      "payments",
      "findByOrderId",
      [big, true],
      /WHERE order_id=\? LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "payments",
      "findByTransactionId",
      [hostile, true],
      /WHERE transaction_id=\? LIMIT 1 FOR UPDATE$/,
      [hostile],
    ],
    [
      "payments",
      "updatePrepay",
      [big, hostile],
      /SET prepay_id=\?.*WHERE id=\?$/,
      [hostile, big],
    ],
    [
      "payments",
      "updateProviderResult",
      [
        big,
        null,
        { trade_state: "SUCCESS", transaction_id: hostile, success_time: time },
      ],
      /SET trade_state=\?,transaction_id=\?,success_time=\?.*WHERE id=\? AND trade_state <=> \?$/,
      ["SUCCESS", hostile, time, big, null],
    ],
    [
      "paymentReconciliationRuns",
      "insert",
      [{ bill_date: "2026-10-21", status: "RUNNING", started_at: time }],
      /INSERT INTO payment_reconciliation_runs/,
      ["2026-10-21", "RUNNING", time],
    ],
    [
      "paymentReconciliationRuns",
      "findById",
      [big, true],
      /WHERE id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "paymentReconciliationRuns",
      "findByBillDate",
      [hostile, true],
      /WHERE bill_date=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [hostile],
    ],
    [
      "paymentReconciliationRuns",
      "list",
      [{ status: "FAILED", billDate: hostile }, 10, 20],
      /WHERE is_deleted=0 AND status=\? AND bill_date=\? ORDER BY bill_date DESC,id DESC LIMIT \? OFFSET \?$/,
      ["FAILED", hostile, 10, 20],
    ],
    [
      "paymentReconciliationRuns",
      "updateState",
      [
        big,
        "RUNNING",
        {
          status: "FAILED",
          total_count: 3,
          matched_count: 1,
          issue_count: 2,
          started_at: time,
          finished_at: time,
          error_message: hostile,
        },
      ],
      /WHERE id=\? AND status=\? AND is_deleted=0$/,
      ["FAILED", 3, 1, 2, time, time, hostile, big, "RUNNING"],
    ],
    [
      "paymentReconciliationIssues",
      "insert",
      [
        {
          run_id: big,
          issue_type: "OTHER",
          order_id: null,
          order_no: null,
          out_trade_no: hostile,
          transaction_id: null,
          local_status: null,
          wechat_trade_state: null,
          local_amount_cent: big,
          wechat_amount_cent: big,
        },
      ],
      /INSERT INTO payment_reconciliation_issues/,
      [big, "OTHER", null, null, hostile, null, null, null, big, big],
    ],
    [
      "paymentReconciliationIssues",
      "findById",
      [big],
      /WHERE id=\? AND is_deleted=0 LIMIT 1$/,
      [big],
    ],
    [
      "paymentReconciliationIssues",
      "list",
      [
        {
          runId: big,
          issueType: "OTHER",
          resolutionStatus: "OPEN",
          orderId: big,
          outTradeNo: hostile,
        },
        10,
        20,
      ],
      /WHERE is_deleted=0 AND run_id=\? AND issue_type=\? AND resolution_status=\? AND order_id=\? AND out_trade_no=\? ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [big, "OTHER", "OPEN", big, hostile, 10, 20],
    ],
    [
      "paymentReconciliationIssues",
      "countUnresolved",
      [big],
      /WHERE resolution_status=\? AND is_deleted=0 AND run_id=\?$/,
      ["OPEN", big],
    ],
    [
      "paymentReconciliationIssues",
      "updateResolution",
      [
        big,
        "OPEN",
        {
          resolution_status: "RESOLVED",
          resolution_note: hostile,
          resolved_by: "uid",
          resolved_at: time,
        },
      ],
      /WHERE id=\? AND resolution_status=\? AND is_deleted=0$/,
      ["RESOLVED", hostile, "uid", time, big, "OPEN"],
    ],
    [
      "reservations",
      "insertMany",
      [[{ order_id: big, sku_id: big, quantity: 2, status: "RESERVED" }]],
      /INSERT INTO order_stock_reservations/,
      [big, big, 2, "RESERVED"],
    ],
    [
      "reservations",
      "listByOrder",
      [big, "RESERVED", true],
      /WHERE order_id=\? AND is_deleted=0 AND status=\? ORDER BY id FOR UPDATE$/,
      [big, "RESERVED"],
    ],
    [
      "reservations",
      "listBySku",
      [big, "RESERVED", 10, 20],
      /WHERE sku_id=\? AND is_deleted=0 AND status=\? ORDER BY id LIMIT \? OFFSET \?$/,
      [big, "RESERVED", 10, 20],
    ],
    [
      "reservations",
      "updateState",
      [big, "RESERVED", "CONSUMED"],
      /SET status=\?.*WHERE id=\? AND status=\? AND is_deleted=0$/,
      ["CONSUMED", big, "RESERVED"],
    ],
    [
      "inventoryMovements",
      "insert",
      [movement],
      /INSERT INTO inventory_movements/,
      Object.values(movement),
    ],
    [
      "inventoryMovements",
      "insertMany",
      [[movement, movement]],
      /INSERT INTO inventory_movements/,
      [...Object.values(movement), ...Object.values(movement)],
    ],
    [
      "inventoryMovements",
      "listByOrder",
      [big, 10, 20],
      /WHERE order_id=\? AND is_deleted=0 ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [big, 10, 20],
    ],
    [
      "referralRelations",
      "insert",
      [
        {
          inviter_account_id: big,
          invitee_account_id: "2",
          bind_channel: "MANUAL_CODE",
          invite_code_snapshot: hostile,
        },
      ],
      /INSERT INTO referral_relations/,
      [big, "2", "MANUAL_CODE", hostile],
    ],
    [
      "referralRelations",
      "findById",
      [big, true],
      /WHERE id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "referralRelations",
      "findByInvitee",
      [big, true],
      /WHERE invitee_account_id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "referralRelations",
      "listByInviter",
      [big, 10, 20],
      /WHERE inviter_account_id=\? AND is_deleted=0 ORDER BY created_at DESC,id DESC LIMIT \? OFFSET \?$/,
      [big, 10, 20],
    ],
    [
      "referralRelations",
      "countByInviter",
      [big],
      /WHERE inviter_account_id=\? AND is_deleted=0$/,
      [big],
    ],
    [
      "skuCoupons",
      "insert",
      [coupon],
      /INSERT INTO user_sku_coupons/,
      Object.values(coupon),
    ],
    [
      "skuCoupons",
      "findById",
      [big, true],
      /WHERE id=\? AND is_deleted=0 LIMIT 1 FOR UPDATE$/,
      [big],
    ],
    [
      "skuCoupons",
      "findByIds",
      [[big], true],
      /WHERE id IN \(\?\) AND is_deleted=0 ORDER BY id FOR UPDATE$/,
      [big],
    ],
    [
      "skuCoupons",
      "listByOwner",
      [big, { status: "AVAILABLE", skuId: big }, 10, 20],
      /WHERE account_id=\? AND is_deleted=0 AND status=\? AND sku_id=\? ORDER BY id LIMIT \? OFFSET \?$/,
      [big, "AVAILABLE", big, 10, 20],
    ],
    [
      "skuCoupons",
      "listByOrder",
      [big, true],
      /WHERE \(locked_order_id=\? OR used_order_id=\?\) AND is_deleted=0 ORDER BY id FOR UPDATE$/,
      [big, big],
    ],
    [
      "skuCoupons",
      "listBySku",
      [big, "AVAILABLE", 10, 20],
      /WHERE sku_id=\? AND is_deleted=0 AND status=\? ORDER BY id LIMIT \? OFFSET \?$/,
      [big, "AVAILABLE", 10, 20],
    ],
    [
      "skuCoupons",
      "countAvailableBySku",
      [big, [big, "2"]],
      /WHERE account_id=\? AND sku_id IN \(\?,\?\) AND status=\? AND is_deleted=0 GROUP BY sku_id ORDER BY sku_id$/,
      [big, big, "2", "AVAILABLE"],
    ],
    [
      "skuCoupons",
      "updateState",
      [
        big,
        "AVAILABLE",
        {
          status: "LOCKED",
          locked_order_id: big,
          locked_at: time,
          used_order_id: null,
          used_at: null,
          refunded_at: null,
          refund_reason: null,
        },
      ],
      /WHERE id=\? AND status=\? AND is_deleted=0$/,
      ["LOCKED", big, time, null, null, null, null, big, "AVAILABLE"],
    ],
    [
      "skuCoupons",
      "updateStates",
      [
        [big, "2"],
        "LOCKED",
        {
          status: "USED",
          locked_order_id: null,
          locked_at: null,
          used_order_id: big,
          used_at: time,
          refunded_at: null,
          refund_reason: null,
        },
      ],
      /WHERE id IN \(\?,\?\) AND status=\? AND is_deleted=0$/,
      ["USED", null, null, big, time, null, null, big, "2", "LOCKED"],
    ],
    [
      "categories",
      "findByIds",
      [[big]],
      /WHERE c.id IN \(\?\) AND c.is_deleted=0 ORDER BY c.id$/,
      [big],
    ],
    [
      "items",
      "findByIds",
      [[big], true],
      /WHERE i.id IN \(\?\) AND i.is_deleted=0 ORDER BY i.id FOR UPDATE OF i$/,
      [big],
    ],
    [
      "skus",
      "findByIds",
      [[big], true],
      /WHERE id IN \(\?\) AND is_deleted=0 ORDER BY id FOR UPDATE$/,
      [big],
    ],
    [
      "skus",
      "listPointsExchange",
      [10, 20],
      /WHERE points_exchange_enabled=1 AND is_on_sale=1 AND is_deleted=0 ORDER BY id LIMIT \? OFFSET \?$/,
      [10, 20],
    ],
    [
      "skus",
      "updateStockCounters",
      [big, 10, 3, { stock_total: 12, stock_reserved: 4 }],
      /SET stock_total=\?,stock_reserved=\?.*WHERE id=\? AND stock_total=\? AND stock_reserved=\? AND is_deleted=0 AND \?>=\?$/,
      [12, 4, big, 10, 3, 12, 4],
    ],
  ];
  it.each(cases)(
    "%s.%s executes one parameterized table operation",
    async (key, method, args, pattern, params) => {
      const { db, dao } = setup(key);
      const result = await invoke(dao, method, args);
      sql(db, pattern, params);
      if (
        db.calls[0]!.sql.startsWith("UPDATE") ||
        db.calls[0]!.sql.includes("ON DUPLICATE KEY UPDATE") ||
        method === "insertMany"
      )
        expect(result).toBe(0);
      else if (method === "insert" || method === "insertAdjustment")
        expect(result).toBe(big);
    },
  );
  it.each([
    ["cart", "findSelected", ["owner", []]],
    ["cart", "softDeleteMany", ["owner", []]],
    ["orderItems", "insertMany", [[]]],
    ["orderItems", "listByOrderIds", [[]]],
    ["reservations", "insertMany", [[]]],
    ["inventoryMovements", "insertMany", [[]]],
    ["skuCoupons", "updateStates", [[], "AVAILABLE", {}]],
    ["skuCoupons", "countAvailableBySku", [big, []]],
  ])("%s.%s short circuits empty arrays", async (key, method, args) => {
    const { db, dao } = setup(key as string);
    await invoke(dao, method as string, args as unknown[]);
    expect(db.calls).toEqual([]);
  });
  it.each([
    "designVersions",
    "orderItems",
    "inventoryMovements",
    "pointsLedger",
  ])("%s retains immutable facts", (key) => {
    const { dao } = setup(key);
    expect(dao.update).toBeUndefined();
    expect(dao.softDelete).toBeUndefined();
    expect(dao.delete).toBeUndefined();
  });
  it("bounds pagination technically and keeps returned JSON raw", async () => {
    const { db, dao } = setup("designs");
    const row = { id: big, name: "N" };
    db.rows = [row];
    expect(await invoke(dao, "listByOwner", [hostile, Infinity, -20])).toEqual([
      row,
    ]);
    sql(db, /LIMIT \? OFFSET \?$/, [hostile, 50, 0]);
  });
  it("clamps offset to a safe integer", async () => {
    const db = new Recorder();
    await createDaos(db).designs.listByOwner("owner", 900, 1e30);
    sql(db, /LIMIT \? OFFSET \?$/, ["owner", 500, Number.MAX_SAFE_INTEGER]);
  });
  it("propagates storage uniqueness errors", async () => {
    const db = new Recorder();
    const error = new Error("duplicate");
    db.execute = async () => {
      throw error;
    };
    await expect(
      createDaos(db).reconciliationRuns.insert({
        bill_date: "date",
        status: "RUNNING",
        started_at: time,
      }),
    ).rejects.toBe(error);
  });
  it("reports zero rows for failed conditional writes", async () => {
    const db = new Recorder();
    expect(
      await createDaos(db).orders.updateShipment(big, "READY_TO_SHIP", {
        status: "SHIPPED",
        carrier_name: "C",
        tracking_no: "T",
        shipped_at: time,
      }),
    ).toBe(0);
    expect(db.calls).toHaveLength(1);
  });
  it("passes through raw driver rows and JSON without bigint conversion", async () => {
    const db = new Recorder();
    const row = { id: big, components: '[{"sku_id":"18446744073709551614"}]' };
    db.rows = [row];
    expect(await createDaos(db).designVersions.findById(big)).toBe(row);
    expect(db.calls[0]!.sql).toContain("CAST(design_id AS CHAR) AS design_id");
  });
  it("returns actual affected counts without translating outcomes", async () => {
    const db = new Recorder();
    db.affectedRows = 7;
    const daos = createDaos(db);
    expect(await daos.cart.softDeleteMany("owner", [big])).toBe(7);
    expect(
      await daos.orders.updateShipment(big, "CLOSED", {
        status: "SHIPPED",
        carrier_name: "C",
        tracking_no: "T",
        shipped_at: time,
      }),
    ).toBe(7);
  });
  it("binds every concrete DAO to the UnitOfWork connection", async () => {
    const db = new Recorder();
    const lifecycle: string[] = [];
    const connection: DatabaseConnection = {
      query: db.query.bind(db),
      execute: db.execute.bind(db),
      async beginTransaction() {
        lifecycle.push("begin");
      },
      async commit() {
        lifecycle.push("commit");
      },
      async rollback() {
        lifecycle.push("rollback");
      },
      async release() {
        lifecycle.push("release");
      },
      async destroy() {
        lifecycle.push("destroy");
      },
    };
    const work = new UnitOfWork(
      {
        async getConnection() {
          lifecycle.push("acquire");
          return connection;
        },
      },
      createDaos,
    );
    await work.run(async (d) => {
      await d.siteConfig.findByKey("k");
      await d.admin.findById(big);
      await d.pointsAccounts.findById(big);
      await d.pointsLedger.findByEventKey("e");
      await d.categories.findById(big);
      await d.items.findById(big);
      await d.skus.findById(big);
      await d.designs.findByOwnerId("o", big);
      await d.designVersions.findById(big);
      await d.cart.findByOwnerId("o", big);
      await d.addresses.findByOwnerId("o", big);
      await d.orders.findById(big);
      await d.orderItems.listByOrder(big);
      await d.payments.findById(big);
      await d.reconciliationRuns.findById(big);
      await d.reconciliationIssues.findById(big);
      await d.reservations.listByOrder(big);
      await d.inventoryMovements.findByEventKey("e");
      await d.referrals.findById(big);
      await d.skuCoupons.findById(big);
    });
    expect(db.calls).toHaveLength(20);
    expect(lifecycle).toEqual(["acquire", "begin", "commit", "release"]);
  });
  it("keeps coupon account joins outside locked reads and preserves deactivation order", async () => {
    const db = new Recorder();
    const d = createDaos(db);
    await d.skuCoupons.listActiveBySku(big, true);
    expect(db.calls[0]!.sql).not.toContain("JOIN");
    expect(db.calls[0]!.sql).toMatch(/ORDER BY q.id FOR UPDATE$/);
    db.calls = [];
    await d.skuCoupons.listActiveBySku(big, false);
    expect(db.calls[0]!.sql).toContain("LEFT JOIN points_accounts");
    expect(db.calls[0]!.params).toEqual([big]);
  });
  it("scans recent records across caller states without filtering hidden finance history", async () => {
    const db = new Recorder();
    const dao = createDaos(db).orders;
    await dao.scanRecent(time, ["PENDING_PAYMENT", "READY_TO_SHIP"], 10);
    sql(
      db,
      /WHERE created_at>=\? AND status IN \(\?,\?\) ORDER BY created_at,id LIMIT \?$/,
      [time, "PENDING_PAYMENT", "READY_TO_SHIP", 10],
    );
    expect(db.calls[0]!.sql).not.toMatch(/is_deleted\s*=/);
  });
  it("short circuits an empty recent-state selection", async () => {
    const db = new Recorder();
    expect(await createDaos(db).orders.scanRecent(time, [])).toEqual([]);
    expect(db.calls).toEqual([]);
  });
  it("projects reconciliation DATE values as strings for every read", async () => {
    const db = new Recorder();
    db.rows = [{ id: big, bill_date: "2026-10-21" }];
    const dao = createDaos(db).reconciliationRuns;
    const byId = await dao.findById(big);
    const byDate = await dao.findByBillDate("2026-10-21");
    const list = await dao.list({ billDate: "2026-10-21" });
    expect([byId?.bill_date, byDate?.bill_date, list[0]?.bill_date]).toEqual([
      "2026-10-21",
      "2026-10-21",
      "2026-10-21",
    ]);
    for (const call of db.calls)
      expect(call.sql).toContain("CAST(bill_date AS CHAR) AS bill_date");
    expect(db.calls.map((call) => call.params)).toEqual([
      [big],
      ["2026-10-21"],
      ["2026-10-21", 50, 0],
    ]);
  });
  it("uses numeric base columns consistently for inventory movement keyset pagination", async () => {
    const db = new Recorder();
    await createDaos(db).inventoryMovements.listBySku(
      big,
      { id: "9", time },
      10,
    );
    sql(
      db,
      /FROM inventory_movements WHERE sku_id=\? AND is_deleted=0 AND \(inventory_movements.created_at<\? OR \(inventory_movements.created_at=\? AND inventory_movements.id<\?\)\) ORDER BY inventory_movements.created_at DESC,inventory_movements.id DESC LIMIT \?$/,
      [big, time, time, "9", 10],
    );
    expect(db.calls[0]!.sql).toContain("CAST(id AS CHAR) AS id");
  });
  it("uses numeric inventory ordering on the first page too", async () => {
    const db = new Recorder();
    await createDaos(db).inventoryMovements.listBySku(big, null, 10);
    sql(
      db,
      /WHERE sku_id=\? AND is_deleted=0 ORDER BY inventory_movements.created_at DESC,inventory_movements.id DESC LIMIT \?$/,
      [big, 10],
    );
  });
});
