import { describe, expect, it, vi } from "vitest";
import {
  type DaoSet,
  type OrderRow,
  type OrderItemRow,
  type SkuCouponRow,
} from "../../packages/backend/src/dao/index";
import { buyerFixture } from "../helpers/buyer-fixture";
import { CheckoutService } from "../../packages/backend/src/services/checkout-service";
import { OrderService } from "../../packages/backend/src/services/order-service";
import type { UnitOfWork } from "../../packages/backend/src/db/unit-of-work";
import type { AdminAccessService } from "../../packages/backend/src/services/admin-access-service";
import type { ReferralService } from "../../packages/backend/src/services/referral-service";
const user = { kind: "wechat" as const, openid: "user" };
const admin = { kind: "web" as const, uid: "admin" };

it('keeps purchased design version identifiers in the immutable order snapshot', async () => {
  const f = fixture();
  const target = await setupDesign(f);
  const quote = await f.checkout.previewDirectOrder(target, user);
  await f.checkout.createDirectOrder({ ...target, checkout_key: 'snapshot-version', quote_hash: quote.quote_hash }, user);
  expect(f.items[0]?.item_snapshot).toMatchObject({ design_version_id: target.design_version_id, version_no: 1 });
});
const meta = {
  created_at: "2026-10-22 00:00:00",
  updated_at: "2026-10-22 00:00:00",
  is_deleted: 0,
};
function fixture() {
  const b = buyerFixture();
  const d = b.d;
  const orders = new Map<string, OrderRow>();
  const items: OrderItemRow[] = [];
  const coupons: SkuCouponRow[] = [];
  const events: string[] = [];
  const clock = new Date("2026-10-22T00:00:00Z");
  vi.spyOn(d.orders, "now").mockImplementation(async () => clock);
  vi.spyOn(d.orders, "findByCheckoutKey").mockImplementation(
    async (owner, key) =>
      [...orders.values()].find(
        (o) => o._openid === owner && o.checkout_key === key,
      ) ?? null,
  );
  vi.spyOn(d.orders, "findByOrderNo").mockImplementation(async (no, lock) => {
    if (lock) events.push("order-lock");
    return [...orders.values()].find((o) => o.order_no === no) ?? null;
  });
  vi.spyOn(d.orders, "insert").mockImplementation(async (input) => {
    const id = String(orders.size + 1);
    orders.set(id, { ...meta, ...structuredClone(input), id });
    return id;
  });
  vi.spyOn(d.orderItems, "insertMany").mockImplementation(async (rows) => {
    items.push(
      ...rows.map((r, i) => ({
        ...meta,
        ...structuredClone(r),
        id: String(items.length + i + 1),
      })),
    );
    return rows.length;
  });
  vi.spyOn(d.orderItems, "listByOrder").mockImplementation(async (id) =>
    items.filter((i) => i.order_id === id),
  );
  vi.spyOn(d.orderItems, "listByOrderIds").mockImplementation(async (ids) =>
    items.filter((i) => ids.includes(i.order_id)),
  );
  vi.spyOn(d.orders, "updateShipment").mockImplementation(
    async (id, expected, value) => {
      const o = orders.get(id);
      if (o?.status !== expected) return 0;
      Object.assign(o, value);
      return 1;
    },
  );
  vi.spyOn(d.orders, "updateState").mockImplementation(
    async (id, expected, value) => {
      const o = orders.get(id);
      if (o?.status !== expected) return 0;
      events.push("transition");
      Object.assign(o, value);
      return 1;
    },
  );
  vi.spyOn(d.orders, "listByOwner").mockImplementation(async (owner) =>
    [...orders.values()].filter((o) => o._openid === owner && !o.is_deleted),
  );
  vi.spyOn(d.orders, "listAdmin").mockImplementation(async (filter) =>
    [...orders.values()].filter(
      (o) =>
        !o.is_deleted &&
        (!filter?.openid || o._openid === filter.openid) &&
        (!filter?.status || o.status === filter.status),
    ),
  );
  vi.spyOn(d.cart, "findSelected").mockImplementation(async (owner, ids) =>
    [...b.carts.values()].filter(
      (c) => c._openid === owner && ids.includes(c.id) && !c.is_deleted,
    ),
  );
  vi.spyOn(d.cart, "softDeleteMany").mockImplementation(async (owner, ids) => {
    const rows = [...b.carts.values()].filter(
      (c) => c._openid === owner && ids.includes(c.id) && !c.is_deleted,
    );
    rows.forEach((c) => {
      c.is_deleted = 1;
    });
    return rows.length;
  });
  vi.spyOn(d.skus, "findByIds").mockImplementation(async (ids) =>
    ids.includes("1") ? [b.sku] : [],
  );
  vi.spyOn(d.items, "findById").mockImplementation(async () => b.item);
  vi.spyOn(d.categories, "findById").mockImplementation(async () => b.category);
  vi.spyOn(d.skus, "updateStockCounters").mockImplementation(
    async (_id, total, reserved, next) => {
      if (b.sku.stock_total !== total || b.sku.stock_reserved !== reserved)
        return 0;
      Object.assign(b.sku, next);
      return 1;
    },
  );
  vi.spyOn(d.pointsAccounts, "findByOpenId").mockResolvedValue({
    id: "9",
    _openid: "user",
    balance: "0",
    total_earned: "0",
    total_spent: "0",
    invite_code: "AAAA",
  });
  vi.spyOn(d.pointsAccounts, "findForUpdate").mockImplementation(async () => {
    events.push("account-lock");
    return {
      id: "9",
      _openid: "user",
      balance: "0",
      total_earned: "0",
      total_spent: "0",
      invite_code: "AAAA",
    };
  });
  vi.spyOn(d.skuCoupons, "listAvailableForCheckout").mockImplementation(
    async () => coupons.filter((c) => c.status === "AVAILABLE"),
  );
  vi.spyOn(d.skuCoupons, "updateStates").mockImplementation(
    async (ids, expected, next) => {
      const rows = coupons.filter(
        (c) => ids.includes(c.id) && c.status === expected,
      );
      rows.forEach((c) => Object.assign(c, next));
      return rows.length;
    },
  );
  vi.spyOn(d.siteConfig, "findByKey").mockImplementation(async (key) => ({
    config_key: key,
    config_value:
      key === "shipping_rules"
        ? {
            regions: [
              {
                province_code: "440000",
                province_name: "广东省",
                shipping_fee_cent: 0,
                sort_order: 0,
                enabled: true,
              },
            ],
          }
        : { payment_timeout_minutes: 5 },
  }));
  vi.spyOn(d.payments, "insert");
  vi.spyOn(d.reservations, "insertMany");
  vi.spyOn(d.inventoryMovements, "insertMany");
  const run = vi.fn(async <T>(fn: (d: DaoSet) => Promise<T>) => {
    const saved = {
      orders: structuredClone([...orders]),
      items: structuredClone(items),
      coupons: structuredClone(coupons),
      sku: structuredClone(b.sku),
      carts: structuredClone([...b.carts]),
    };
    try {
      return await fn(d);
    } catch (error) {
      orders.clear();
      saved.orders.forEach(([id, row]) => orders.set(id, row));
      items.splice(0, items.length, ...saved.items);
      coupons.splice(0, coupons.length, ...saved.coupons);
      Object.assign(b.sku, saved.sku);
      b.carts.clear();
      saved.carts.forEach(([id, row]) => b.carts.set(id, row));
      throw error;
    }
  });
  const uow = { run } as unknown as UnitOfWork<DaoSet>;
  const access = {
    requireEnabledAdmin: vi.fn(async (identity: unknown) => {
      if (JSON.stringify(identity) !== JSON.stringify(admin))
        throw Object.assign(new Error(), { code: "FORBIDDEN" });
      return { auth_uid: "admin" };
    }),
  } as unknown as AdminAccessService;
  const referral = {
    lockCompletionAccounts: vi.fn(async () => {
      events.push("reward-lock");
      return { openid: "user" };
    }),
    grantFirstCompletedOrderReward: vi.fn(async () => {
      events.push("reward");
    }),
  } as unknown as ReferralService;
  const checkout = new CheckoutService(d, uow, {
    orderNo: () => `O20261022${String(orders.size + 1).padStart(8, "0")}`,
  });
  const order = new OrderService(d, uow, access, referral, {
    tokenSecret: "s".repeat(32),
  });
  return {
    ...b,
    d,
    uow,
    run,
    checkout,
    order,
    orders,
    items,
    coupons,
    events,
    clock,
    referral,
  };
}
async function setupDesign(f: ReturnType<typeof fixture>, quantity = 1) {
  const design = await f.design.saveDesign(
    {
      design_id: null,
      name: "设计",
      components: [{ sku_id: "1" }, { sku_id: "1" }],
    },
    user,
  );
  return {
    item_type: "DESIGN" as const,
    sku_id: null,
    design_version_id: design.design_version_id,
    quantity,
    address_id: await address(f),
  };
}
async function address(f: ReturnType<typeof fixture>) {
  const row = await f.address.saveAddress(
    {
      address_id: null,
      receiver_name: "张三",
      phone: "13800000000",
      province_code: "440000",
      city_code: "440300",
      city: "深圳市",
      district_code: "440305",
      district: "南山区",
      address_line: "测试地址",
      set_as_default: false,
    },
    user,
  );
  return row.address_id;
}
function coupon(id: string): SkuCouponRow {
  return {
    ...meta,
    id,
    account_id: "9",
    sku_id: "1",
    source_type: "POINTS_EXCHANGE",
    source_ref: null,
    points_cost_snapshot: 100,
    event_key: id,
    status: "AVAILABLE",
    locked_order_id: null,
    locked_at: null,
    used_order_id: null,
    used_at: null,
    refunded_at: null,
    refund_reason: null,
  };
}
describe("authoritative checkout", () => {
  it("returns a fresh unlocked quote after quantity drift has rolled back", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    const added = await f.cart.addCartItem(
      {
        item_type: "DESIGN",
        design_version_id: target.design_version_id,
        quantity: 1,
      },
      user,
    );
    const quote = await f.checkout.previewOrderFromCart(
      { cart_item_ids: [added.cart_item_id], address_id: target.address_id },
      user,
    );
    f.carts.get(added.cart_item_id)!.quantity = 3;
    let active = false;
    const run = f.run.getMockImplementation()!;
    f.run.mockImplementation(async (fn) => {
      active = true;
      try {
        return await run(fn);
      } finally {
        active = false;
      }
    });
    const selected = vi.mocked(f.d.cart.findSelected).getMockImplementation()!;
    const reads: { lock: boolean; active: boolean }[] = [];
    vi.mocked(f.d.cart.findSelected).mockImplementation(
      async (owner, ids, lock = false) => {
        reads.push({ lock, active });
        return selected(owner, ids, lock);
      },
    );
    await expect(
      f.checkout.createOrderFromCart(
        {
          checkout_key: "quantity-drift",
          quote_hash: quote.quote_hash,
          cart_items: [{ cart_item_id: added.cart_item_id, quantity: 1 }],
          address_id: target.address_id,
        },
        user,
      ),
    ).rejects.toMatchObject({
      code: "CHECKOUT_CHANGED",
      quote: { items: [{ quantity: 3 }], total_amount_cent: 600 },
    });
    expect(reads).toEqual([
      { lock: true, active: true },
      { lock: false, active: false },
    ]);
    expect(f.d.orders.insert).not.toHaveBeenCalled();
    expect(f.sku.stock_reserved).toBe(0);
  });
  it("refreshes coupon-write and cart-write CHECKOUT_CHANGED quotes only after rollback", async () => {
    for (const fail of ["coupon", "cart"] as const) {
      const f = fixture();
      const target = await setupDesign(f);
      const added = await f.cart.addCartItem(
        {
          item_type: "DESIGN",
          design_version_id: target.design_version_id,
          quantity: 1,
        },
        user,
      );
      f.coupons.push(coupon("1"));
      const quote = await f.checkout.previewOrderFromCart(
        { cart_item_ids: [added.cart_item_id], address_id: target.address_id },
        user,
      );
      if (fail === "coupon")
        vi.mocked(f.d.skuCoupons.updateStates).mockResolvedValue(0);
      else vi.mocked(f.d.cart.softDeleteMany).mockResolvedValue(0);
      const run = f.run.getMockImplementation()!;
      f.run.mockImplementation(async (fn) => {
        try {
          return await run(fn);
        } catch (error) {
          f.sku.price_cent = "150";
          throw error;
        }
      });
      await expect(
        f.checkout.createOrderFromCart(
          {
            checkout_key: `write-${fail}`,
            quote_hash: quote.quote_hash,
            cart_items: [{ cart_item_id: added.cart_item_id, quantity: 1 }],
            address_id: target.address_id,
          },
          user,
        ),
      ).rejects.toMatchObject({
        code: "CHECKOUT_CHANGED",
        quote: {
          goods_amount_cent: 300,
          discount_amount_cent: 150,
          total_amount_cent: 150,
        },
      });
      expect(f.orders.size).toBe(0);
      expect(f.sku.stock_reserved).toBe(0);
      expect(f.coupons[0]?.status).toBe("AVAILABLE");
      expect(f.carts.get(added.cart_item_id)?.is_deleted).toBe(0);
    }
  });
  it("preserves fresh unavailable/address errors instead of masking them as CHECKOUT_CHANGED", async () => {
    for (const unavailable of ["item", "address"] as const) {
      const f = fixture();
      const target = await setupDesign(f);
      const quote = await f.checkout.previewDirectOrder(target, user);
      f.sku.price_cent = "110";
      const run = f.run.getMockImplementation()!;
      f.run.mockImplementation(async (fn) => {
        try {
          return await run(fn);
        } catch (error) {
          if (unavailable === "item") f.sku.is_on_sale = 0;
          else f.addresses.get(target.address_id)!.is_deleted = 1;
          throw error;
        }
      });
      await expect(
        f.checkout.createDirectOrder(
          {
            ...target,
            checkout_key: `refresh-${unavailable}`,
            quote_hash: quote.quote_hash,
          },
          user,
        ),
      ).rejects.toMatchObject({
        code: unavailable === "item" ? "ITEM_UNAVAILABLE" : "NOT_FOUND",
      });
      expect(f.orders.size).toBe(0);
      expect(f.sku.stock_reserved).toBe(0);
    }
  });
  it("refreshes canonical direct targets when the mutually exclusive ID was omitted", async () => {
    const f = fixture();
    const saved = await setupDesign(f);
    const target = {
      item_type: "DESIGN" as const,
      design_version_id: saved.design_version_id,
      quantity: 1,
      address_id: saved.address_id,
    };
    const quote = await f.checkout.previewDirectOrder(target, user);
    f.sku.price_cent = "120";
    await expect(
      f.checkout.createDirectOrder(
        { ...target, checkout_key: "omitted-id", quote_hash: quote.quote_hash },
        user,
      ),
    ).rejects.toMatchObject({
      code: "CHECKOUT_CHANGED",
      quote: { total_amount_cent: 240 },
    });
  });
  it("allocates coupons once across cart lines and repeated components times quantity, without writes", async () => {
    const f = fixture();
    const direct = await setupDesign(f, 2);
    const second = await f.design.saveDesign(
      { design_id: null, name: "第二个", components: [{ sku_id: "1" }] },
      user,
    );
    const one = await f.cart.addCartItem(
      {
        item_type: "DESIGN",
        design_version_id: direct.design_version_id,
        quantity: 2,
      },
      user,
    );
    const two = await f.cart.addCartItem(
      {
        item_type: "DESIGN",
        design_version_id: second.design_version_id,
        quantity: 2,
      },
      user,
    );
    f.coupons.push(
      coupon("2"),
      coupon("1"),
      coupon("3"),
      coupon("4"),
      coupon("5"),
    );
    f.run.mockClear();
    const quote = await f.checkout.previewOrderFromCart(
      {
        cart_item_ids: [two.cart_item_id, one.cart_item_id],
        address_id: direct.address_id,
      },
      user,
    );
    expect(quote).toMatchObject({
      goods_amount_cent: 600,
      discount_amount_cent: 500,
      total_amount_cent: 100,
    });
    expect(quote.items.map((i) => i.discount_amount_cent)).toEqual([400, 100]);
    expect(f.run).not.toHaveBeenCalled();
    expect(f.d.skus.updateStockCounters).not.toHaveBeenCalled();
    expect(f.d.orders.insert).not.toHaveBeenCalled();
  });
  it("creates positive cash atomically and replays the original intent after cart deletion", async () => {
    const f = fixture();
    const target = await setupDesign(f, 2);
    const added = await f.cart.addCartItem(
      {
        item_type: "DESIGN",
        design_version_id: target.design_version_id,
        quantity: 2,
      },
      user,
    );
    f.coupons.push(coupon("1"));
    const quote = await f.checkout.previewOrderFromCart(
      { cart_item_ids: [added.cart_item_id], address_id: target.address_id },
      user,
    );
    const payload = {
      checkout_key: "key-1",
      quote_hash: quote.quote_hash,
      cart_items: [{ cart_item_id: added.cart_item_id, quantity: 2 }],
      address_id: target.address_id,
    };
    const result = await f.checkout.createOrderFromCart(payload, user);
    expect(result).toMatchObject({
      payment_mode: "WECHAT",
      status: "PENDING_PAYMENT",
      total_amount_cent: 300,
      requires_payment: true,
      payment_deadline_at: "2026-10-22T00:05:00.000Z",
    });
    expect(f.sku.stock_reserved).toBe(4);
    expect(f.coupons[0]?.status).toBe("LOCKED");
    expect(f.carts.get(added.cart_item_id)?.is_deleted).toBe(1);
    expect(await f.checkout.createOrderFromCart(payload, user)).toMatchObject({
      order_no: result.order_no,
      idempotent_replay: true,
    });
    expect(f.orders.size).toBe(1);
    await expect(
      f.checkout.createOrderFromCart({ ...payload, address_id: "123" }, user),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects changed authoritative price before order/stock writes", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    const quote = await f.checkout.previewDirectOrder(target, user);
    f.sku.price_cent = "101";
    await expect(
      f.checkout.createDirectOrder(
        { ...target, checkout_key: "changed", quote_hash: quote.quote_hash },
        user,
      ),
    ).rejects.toMatchObject({
      code: "CHECKOUT_CHANGED",
      quote: { total_amount_cent: 202 },
    });
    expect(f.orders.size).toBe(0);
    expect(f.d.skus.updateStockCounters).not.toHaveBeenCalled();
  });
  it("consumes a genuine zero cash order directly and skips payment records", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    f.coupons.push(coupon("1"), coupon("2"));
    const quote = await f.checkout.previewDirectOrder(target, user);
    const result = await f.checkout.createDirectOrder(
      { ...target, checkout_key: "free", quote_hash: quote.quote_hash },
      user,
    );
    expect(result).toMatchObject({
      total_amount_cent: 0,
      payment_mode: "ZERO_PAY",
      status: "READY_TO_SHIP",
      requires_payment: false,
      payment_deadline_at: null,
    });
    expect(f.sku).toMatchObject({ stock_total: 98, stock_reserved: 0 });
    expect(f.coupons.map((c) => c.status)).toEqual(["USED", "USED"]);
    expect(f.d.payments.insert).not.toHaveBeenCalled();
    expect(f.d.reservations.insertMany).toHaveBeenCalledWith([
      { order_id: "1", sku_id: "1", quantity: 2, status: "CONSUMED" },
    ]);
  });
  it("requires conditional stock update success", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    const quote = await f.checkout.previewDirectOrder(target, user);
    vi.mocked(f.d.skus.updateStockCounters).mockResolvedValue(0);
    await expect(
      f.checkout.createDirectOrder(
        { ...target, checkout_key: "race", quote_hash: quote.quote_hash },
        user,
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });
  it("never discounts STANDARD and rejects aggregate shortages and unavailable provinces", async () => {
    const f = fixture();
    f.item.catalog_type = "STANDARD";
    f.category.catalog_type = "STANDARD";
    const target = {
      item_type: "STANDARD" as const,
      sku_id: "1",
      design_version_id: null,
      quantity: 1,
      address_id: await address(f),
    };
    f.coupons.push(coupon("1"));
    expect(await f.checkout.previewDirectOrder(target, user)).toMatchObject({
      discount_amount_cent: 0,
      total_amount_cent: 100,
    });
    f.sku.stock_total = 0;
    await expect(
      f.checkout.previewDirectOrder(target, user),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    f.sku.stock_total = 100;
    f.addresses.get(target.address_id)!.province_code = "999999";
    await expect(
      f.checkout.previewDirectOrder(target, user),
    ).rejects.toMatchObject({ code: "SHIPPING_UNAVAILABLE" });
  });
  it("rejects foreign addresses and design versions", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    await expect(
      f.checkout.previewDirectOrder(target, {
        kind: "wechat",
        openid: "other",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("recovers original order when a concurrent checkout commits after the initial key read", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    const added = await f.cart.addCartItem(
      {
        item_type: "DESIGN",
        design_version_id: target.design_version_id,
        quantity: 1,
      },
      user,
    );
    const quote = await f.checkout.previewOrderFromCart(
      { cart_item_ids: [added.cart_item_id], address_id: target.address_id },
      user,
    );
    const payload = {
      checkout_key: "committed",
      quote_hash: quote.quote_hash,
      cart_items: [{ cart_item_id: added.cart_item_id, quantity: 1 }],
      address_id: target.address_id,
    };
    const original = await f.checkout.createOrderFromCart(payload, user);
    vi.mocked(f.d.orders.findByCheckoutKey).mockResolvedValueOnce(null);
    expect(await f.checkout.createOrderFromCart(payload, user)).toMatchObject({
      order_no: original.order_no,
      idempotent_replay: true,
    });
    expect(f.orders.size).toBe(1);
  });
  it("keeps amounts above the JSON safe integer boundary exact", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    f.sku.price_cent = "9007199254740993";
    const quote = await f.checkout.previewDirectOrder(target, user);
    expect(quote.goods_amount_cent).toBe("18014398509481986");
    const created = await f.checkout.createDirectOrder(
      { ...target, checkout_key: "large", quote_hash: quote.quote_hash },
      user,
    );
    expect(created.total_amount_cent).toBe("18014398509481986");
    expect(f.items[0]?.unit_price_cent).toBe("18014398509481986");
  });
  it("locks categories/items/skus/accounts before coupons and detects new coupons after preview", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    const quote = await f.checkout.previewDirectOrder(target, user);
    f.coupons.push(coupon("1"));
    await expect(
      f.checkout.createDirectOrder(
        {
          ...target,
          checkout_key: "coupon-change",
          quote_hash: quote.quote_hash,
        },
        user,
      ),
    ).rejects.toMatchObject({
      code: "CHECKOUT_CHANGED",
      quote: { discount_amount_cent: 100 },
    });
    expect(f.orders.size).toBe(0);
    const category = vi
      .mocked(f.d.categories.findById)
      .mock.invocationCallOrder.at(-1)!;
    const item = vi.mocked(f.d.items.findById).mock.invocationCallOrder.at(-1)!;
    const sku = vi.mocked(f.d.skus.findByIds).mock.invocationCallOrder.at(-1)!;
    const account = vi
      .mocked(f.d.pointsAccounts.findForUpdate)
      .mock.invocationCallOrder.at(-1)!;
    const coupons = vi
      .mocked(f.d.skuCoupons.listAvailableForCheckout)
      .mock.invocationCallOrder.at(-1)!;
    expect(
      category < item && item < sku && sku < account && account < coupons,
    ).toBe(true);
  });
  it("rolls back all checkout changes when coupon write loses its conditional state", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    f.coupons.push(coupon("1"));
    const quote = await f.checkout.previewDirectOrder(target, user);
    vi.mocked(f.d.skuCoupons.updateStates).mockResolvedValue(0);
    await expect(
      f.checkout.createDirectOrder(
        { ...target, checkout_key: "rollback", quote_hash: quote.quote_hash },
        user,
      ),
    ).rejects.toMatchObject({ code: "CHECKOUT_CHANGED" });
    expect(f.orders.size).toBe(0);
    expect(f.items).toEqual([]);
    expect(f.sku.stock_reserved).toBe(0);
    expect(f.coupons[0]?.status).toBe("AVAILABLE");
  });
  it("rejects currently deleted parent categories and aggregate stock shortages before writes", async () => {
    const f = fixture();
    const target = await setupDesign(f, 2);
    f.sku.stock_total = 3;
    await expect(
      f.checkout.previewDirectOrder(target, user),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    f.sku.stock_total = 100;
    const quote = await f.checkout.previewDirectOrder(target, user);
    vi.mocked(f.d.categories.findById).mockResolvedValue({
      ...f.category,
      is_enabled: 0,
    });
    await expect(
      f.checkout.createDirectOrder(
        { ...target, checkout_key: "disabled", quote_hash: quote.quote_hash },
        user,
      ),
    ).rejects.toMatchObject({ code: "ITEM_UNAVAILABLE" });
    expect(f.orders.size).toBe(0);
  });
  it("retries a database deadlock in a fresh transaction without creating duplicate orders", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    const quote = await f.checkout.previewDirectOrder(target, user);
    f.run.mockRejectedValueOnce({ code: "ER_LOCK_DEADLOCK" });
    const result = await f.checkout.createDirectOrder(
      { ...target, checkout_key: "deadlock", quote_hash: quote.quote_hash },
      user,
    );
    expect(result.status).toBe("PENDING_PAYMENT");
    expect(f.orders.size).toBe(1);
    expect(f.run).toHaveBeenCalledTimes(2);
  });
  it("stores immutable per-coupon SKU/position/current-price allocations", async () => {
    const f = fixture();
    const target = await setupDesign(f);
    f.coupons.push(coupon("1"));
    const quote = await f.checkout.previewDirectOrder(target, user);
    await f.checkout.createDirectOrder(
      {
        ...target,
        checkout_key: "coupon-snapshot",
        quote_hash: quote.quote_hash,
      },
      user,
    );
    expect(f.items[0]?.promotion_snapshot).toMatchObject({
      coupon_allocations: [
        {
          coupon_id: "1",
          sku_id: "1",
          position: 0,
          free_quantity: 1,
          unit_price_cent: 100,
          discount_amount_cent: 100,
        },
      ],
    });
  });
});
describe("order reads and fulfillment", () => {
  async function created(f: ReturnType<typeof fixture>) {
    const target = await setupDesign(f);
    const quote = await f.checkout.previewDirectOrder(target, user);
    return f.checkout.createDirectOrder(
      { ...target, checkout_key: "order", quote_hash: quote.quote_hash },
      user,
    );
  }
  it("enforces deadline on server, masks buyer phone and hides wrong-owner orders", async () => {
    const f = fixture();
    const result = await created(f);
    expect(
      await f.order.getMyOrderDetail({ order_no: result.order_no }, user),
    ).toMatchObject({
      can_pay: true,
      address_snapshot: { phone_masked: "138****0000" },
    });
    f.clock.setTime(Date.parse("2026-10-22T00:05:00Z"));
    const detail = await f.order.getMyOrderDetail(
      { order_no: result.order_no },
      user,
    );
    expect(detail.can_pay).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("13800000000");
    await expect(
      f.order.getMyOrderDetail(
        { order_no: result.order_no },
        { kind: "wechat", openid: "other" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("ships only ready orders and preserves identical shipment replay", async () => {
    const f = fixture();
    const result = await created(f);
    const payload = {
      order_no: result.order_no,
      carrier_name: "顺丰",
      tracking_no: "SF123456",
    };
    await expect(f.order.shipOrder(payload, admin)).rejects.toMatchObject({
      code: "INVALID_ORDER_STATE",
    });
    f.orders.get("1")!.status = "READY_TO_SHIP";
    f.orders.get("1")!.paid_at = f.clock;
    expect(await f.order.shipOrder(payload, admin)).toMatchObject({
      status: "SHIPPED",
    });
    expect(await f.order.shipOrder(payload, admin)).toMatchObject({
      status: "SHIPPED",
    });
    await expect(
      f.order.shipOrder({ ...payload, tracking_no: "SF987654" }, admin),
    ).rejects.toMatchObject({ code: "SHIPMENT_CONFLICT" });
  });
  it("locks referral accounts BEFORE order, completes and rewards in the same transaction once", async () => {
    const f = fixture();
    const result = await created(f);
    f.orders.get("1")!.status = "SHIPPED";
    f.events.length = 0;
    f.run.mockClear();
    expect(
      await f.order.completeOrder({ order_no: result.order_no }, admin),
    ).toMatchObject({ status: "COMPLETED", idempotent_replay: false });
    expect(f.events).toEqual([
      "reward-lock",
      "order-lock",
      "transition",
      "reward",
    ]);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(
      await f.order.completeOrder({ order_no: result.order_no }, admin),
    ).toMatchObject({ idempotent_replay: true });
    expect(f.referral.grantFirstCompletedOrderReward).toHaveBeenCalledTimes(1);
  });
  it("rejects unauthorized fulfillment and invalid raw payloads", async () => {
    const f = fixture();
    await expect(
      f.order.shipOrder(
        { order_no: "x", carrier_name: "顺丰", tracking_no: "SF123456" },
        user,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.checkout.previewDirectOrder(
        {
          item_type: "STANDARD",
          sku_id: "1",
          design_version_id: "2",
          quantity: 1,
          address_id: "1",
        },
        user,
      ),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });
  it("includes CLOSED orders in all-state lists and binds pagination to the owner", async () => {
    const f = fixture();
    await created(f);
    f.orders.get("1")!.status = "CLOSED";
    expect(
      (
        await f.order.listMyOrders(
          { status: null, page_token: null, page_size: 20 },
          user,
        )
      ).orders[0]?.status,
    ).toBe("CLOSED");
    expect(
      (
        await f.order.listMyOrders(
          { status: null, page_token: null, page_size: 20 },
          { kind: "wechat", openid: "other" },
        )
      ).orders,
    ).toEqual([]);
  });
  it("keeps historic names, prices and buyer addresses independent from mutable sources", async () => {
    const f = fixture();
    const result = await created(f);
    f.item.name = "新名字";
    f.sku.price_cent = "999";
    for (const address of f.addresses.values()) {
      address.phone = "13999999999";
      address.address_line = "新地址";
    }
    const detail = await f.order.getMyOrderDetail(
      { order_no: result.order_no },
      user,
    );
    expect(detail.total_amount_cent).toBe(200);
    expect(detail.items[0]?.item_snapshot.name).toBe("设计");
    expect(detail.address_snapshot.phone_masked).toBe("138****0000");
    expect(detail.address_snapshot.full_address).toContain("测试地址");
  });
  it("does not request a token secret for an unpaginated order response", async () => {
    const f = fixture();
    const secret = vi.fn(() => {
      throw new Error("Missing secret");
    });
    const order = new OrderService(
      f.d,
      f.uow,
      {} as AdminAccessService,
      {} as ReferralService,
      { tokenSecret: secret },
    );
    await order.listMyOrders(
      { status: null, page_token: null, page_size: 20 },
      user,
    );
    expect(secret).not.toHaveBeenCalled();
  });
});
