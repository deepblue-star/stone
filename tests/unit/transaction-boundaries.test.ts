import { describe, expect, it, vi } from "vitest";
import { createDaos } from "../../packages/backend/src/dao/index";
import type {
  DatabaseExecutor,
  SqlParameter,
} from "../../packages/backend/src/db/database";
import { createTransactionActions } from "../../cloudfunctions/business-api/src/transaction-registry";
import type { TransactionServices } from "../../cloudfunctions/business-api/src/transaction-registry";
import { validateTransactionPayload } from "../../packages/backend/src/services/transaction-rules";
const valid = {
  item_type: "STANDARD",
  sku_id: "1",
  design_version_id: null,
  quantity: 1,
  address_id: "2",
};
describe("transaction trust and SQL boundaries", () => {
  it("accepts only null or literal string order statuses for buyer and admin lists", () => {
    for (const action of ["listMyOrders", "listAdminOrders"]) {
      const base = {
        page_token: null,
        page_size: 20,
        ...(action === "listAdminOrders"
          ? { order_no: null, created_from: null, created_to: null }
          : {}),
      };
      for (const status of [["CLOSED"], [], ["PENDING_PAYMENT"], 1, {}, true]) {
        expect(() =>
          validateTransactionPayload(action, { ...base, status }),
        ).toThrowError();
      }
      for (const status of [
        null,
        "PENDING_PAYMENT",
        "READY_TO_SHIP",
        "SHIPPED",
        "COMPLETED",
        "CLOSED",
      ]) {
        expect(validateTransactionPayload(action, { ...base, status })).toEqual(
          { ...base, status },
        );
      }
    }
  });
  it("registers only the ten documented order/checkout actions, resolving identity after structural validation", async () => {
    const checkout = { previewDirectOrder: vi.fn(async () => ({ ok: true })) };
    const actions = new Map(
      createTransactionActions({
        checkoutService: checkout,
        orderService: {},
      } as unknown as TransactionServices),
    );
    expect([...actions.keys()]).toEqual([
      "previewOrderFromCart",
      "previewDirectOrder",
      "createOrderFromCart",
      "createDirectOrder",
      "listMyOrders",
      "getMyOrderDetail",
      "listAdminOrders",
      "getAdminOrderDetail",
      "shipOrder",
      "completeOrder",
    ]);
    const identity = vi.fn(async () => ({
      kind: "wechat" as const,
      openid: "trusted",
    }));
    await expect(
      actions
        .get("previewDirectOrder")!
        .run({ ...valid, price_cent: 0 }, identity),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(identity).not.toHaveBeenCalled();
    await actions.get("previewDirectOrder")!.run(valid, identity);
    expect(checkout.previewDirectOrder).toHaveBeenCalledWith(valid, {
      kind: "wechat",
      openid: "trusted",
    });
  });
  it("rejects spoofed prices, coupons, owners, ambiguous targets and duplicate canonical cart IDs", () => {
    for (const p of [
      { ...valid, coupon_id: "1" },
      { ...valid, _openid: "other" },
      { ...valid, payment_mode: "ZERO_PAY" },
      { ...valid, sku_id: "x" },
      { ...valid, design_version_id: "2" },
      { ...valid, quantity: NaN },
      { ...valid, quantity: 2147483648 },
    ])
      expect(() =>
        validateTransactionPayload("previewDirectOrder", p),
      ).toThrowError();
    expect(() =>
      validateTransactionPayload("previewOrderFromCart", {
        cart_item_ids: ["1", "001"],
        address_id: "2",
      }),
    ).toThrowError();
    expect(() =>
      validateTransactionPayload("createOrderFromCart", {
        checkout_key: "same",
        quote_hash: "a".repeat(64),
        cart_items: [{ cart_item_id: "1", quantity: 1, price_cent: 0 }],
        address_id: "2",
      }),
    ).toThrowError();
  });
  it("uses owner, current AVAILABLE state and deterministic numeric row order in coupon locks", async () => {
    const queries: { sql: string; params: readonly SqlParameter[] }[] = [];
    const db: DatabaseExecutor = {
      query: async <T>(sql: string, params: readonly SqlParameter[] = []) => {
        queries.push({ sql, params });
        return [] as T[];
      },
      execute: async () => ({ affectedRows: 1, insertId: "1" }),
    };
    const d = createDaos(db);
    await d.skuCoupons.listAvailableForCheckout("9", ["1", "10"], true);
    expect(queries[0]?.sql).toContain(
      "account_id=? AND sku_id IN (?,?) AND status='AVAILABLE' AND is_deleted=0 ORDER BY id FOR UPDATE",
    );
    expect(queries[0]?.params).toEqual(["9", "1", "10"]);
    await d.items.findByIds(["1"], true);
    expect(queries[1]?.sql).toContain("c.catalog_type");
    expect(queries[1]?.sql).toContain(
      "JOIN catalog_categories c ON c.id=i.category_id",
    );
    expect(queries[1]?.sql).not.toContain("i.catalog_type");
  });
  it("guards stock comparisons and order state transitions in SQL and reads UTC server time", async () => {
    const calls: string[] = [];
    const db: DatabaseExecutor = {
      query: async <T>(sql: string) => {
        calls.push(sql);
        return [{ now: "2026-10-22 00:00:00" }] as T[];
      },
      execute: async (sql: string) => {
        calls.push(sql);
        return { affectedRows: 0, insertId: "0" };
      },
    };
    const d = createDaos(db);
    expect(
      await d.skus.updateStockCounters("1", 10, 2, {
        stock_total: 10,
        stock_reserved: 4,
      }),
    ).toBe(0);
    expect(calls[0]).toContain(
      "WHERE id=? AND stock_total=? AND stock_reserved=? AND is_deleted=0 AND ?>=?",
    );
    expect(
      await d.orders.updateShipment("1", "READY_TO_SHIP", {
        status: "SHIPPED",
        carrier_name: "顺丰",
        tracking_no: "SF123",
        shipped_at: "2026-10-22 00:00:00",
      }),
    ).toBe(0);
    expect(calls[1]).toContain("WHERE id=? AND status=?");
    expect((await d.orders.now()).toISOString()).toBe(
      "2026-10-22T00:00:00.000Z",
    );
    expect(calls[2]).toBe("SELECT UTC_TIMESTAMP() AS now");
  });
});
