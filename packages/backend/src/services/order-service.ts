import { randomBytes } from "node:crypto";
import type * as C from "../../../contracts/src/index";
import type { DaoSet, OrderRow, OrderItemRow, OrderFilter } from "../dao/index";
import type { UnitOfWork } from "../db/unit-of-work";
import { PageTokens, iso, json } from "../catalog/rules";
import {
  noImageUrls,
  selectedImages,
  type ImageUrlResolver,
} from "../catalog/images";
import { AppError, isRecord } from "../errors";
import { requireWechat } from "./buyer-rules";
import {
  maskPhone,
  money,
  sqlTime,
  validateTransactionPayload,
} from "./transaction-rules";
import type { AdminAccessService } from "./admin-access-service";
import type { ReferralService } from "./referral-service";
export interface OrderServiceOptions {
  tokenSecret?: string | (() => string);
  images?: ImageUrlResolver;
}
export class OrderService {
  private readonly tokens: PageTokens;
  private readonly images: ImageUrlResolver;
  constructor(
    private readonly daos: DaoSet,
    private readonly uow: UnitOfWork<DaoSet>,
    private readonly access: AdminAccessService,
    private readonly referral: ReferralService,
    options: OrderServiceOptions = {},
  ) {
    this.tokens = new PageTokens(
      options.tokenSecret ?? randomBytes(32).toString("hex"),
    );
    this.images = options.images ?? noImageUrls;
  }
  private visible(row: OrderRow | null): OrderRow {
    if (!row || row.is_deleted) throw new AppError("NOT_FOUND", "订单不存在");
    return row;
  }
  private record(value: unknown): Record<string, unknown> {
    const parsed = json(value);
    if (!isRecord(parsed)) throw new AppError("INTERNAL_ERROR", "订单快照无效");
    return parsed;
  }
  private item(row: OrderItemRow): C.OrderItem {
    return {
      item_type: row.item_type,
      quantity: row.quantity,
      gross_amount_cent: money(row.gross_amount_cent),
      discount_amount_cent: money(row.discount_amount_cent),
      line_amount_cent: money(row.line_amount_cent),
      item_snapshot: this.record(row.item_snapshot),
      promotion_snapshot:
        row.promotion_snapshot === null
          ? null
          : this.record(row.promotion_snapshot),
    };
  }
  private async detail(
    d: DaoSet,
    row: OrderRow,
    admin: boolean,
  ): Promise<C.OrderDetail> {
    const address = this.record(row.address_snapshot);
    const phone = typeof address.phone === "string" ? address.phone : "";
    const safeAddress: Record<string, unknown> = admin
      ? { ...address }
      : { ...address, phone_masked: maskPhone(phone) };
    if (!admin) delete safeAddress.phone;
    const items = (await d.orderItems.listByOrder(row.id)).map((item) =>
      this.item(item),
    );
    const now = await d.orders.now();
    const imageIds = items.flatMap((item) => [
      typeof item.item_snapshot.image_file_id === "string"
        ? item.item_snapshot.image_file_id
        : null,
      ...(Array.isArray(item.item_snapshot.components)
        ? item.item_snapshot.components
            .filter(isRecord)
            .map((c) =>
              typeof c.image_file_id === "string" ? c.image_file_id : null,
            )
        : []),
    ]);
    return {
      order_no: row.order_no,
      payment_mode: row.payment_mode,
      status: row.status,
      payment_deadline_at: row.payment_deadline_at
        ? iso(row.payment_deadline_at)
        : null,
      can_pay:
        row.payment_mode === "WECHAT" &&
        row.status === "PENDING_PAYMENT" &&
        row.payment_deadline_at !== null &&
        now.getTime() < Date.parse(iso(row.payment_deadline_at)),
      goods_amount_cent: money(row.goods_amount_cent),
      discount_amount_cent: money(row.discount_amount_cent),
      shipping_fee_cent: money(row.shipping_fee_cent),
      total_amount_cent: money(row.total_amount_cent),
      items,
      address_snapshot: safeAddress,
      shipping:
        row.shipped_at && row.carrier_name && row.tracking_no
          ? {
              carrier_name: row.carrier_name,
              tracking_no: row.tracking_no,
              shipped_at: iso(row.shipped_at),
            }
          : null,
      created_at: iso(row.created_at),
      paid_at: row.paid_at ? iso(row.paid_at) : null,
      completed_at: row.completed_at ? iso(row.completed_at) : null,
      image_urls: await this.images.resolve(selectedImages(imageIds)),
    };
  }
  async getMyOrderDetail(
    p: C.OrderNoPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.OrderDetail> {
    const owner = requireWechat(identity);
    validateTransactionPayload("getMyOrderDetail", p);
    const row = this.visible(await this.daos.orders.findByOrderNo(p.order_no));
    if (row._openid !== owner) throw new AppError("NOT_FOUND", "订单不存在");
    return this.detail(this.daos, row, false);
  }
  async getAdminOrderDetail(
    p: C.OrderNoPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.AdminOrderDetail> {
    await this.access.requireEnabledAdmin(identity);
    validateTransactionPayload("getAdminOrderDetail", p);
    const row = this.visible(await this.daos.orders.findByOrderNo(p.order_no));
    const detail = await this.detail(this.daos, row, true);
    const payment =
      row.payment_mode === "WECHAT"
        ? await this.daos.payments.findByOrderId(row.id)
        : null;
    const reservations = await this.daos.reservations.listByOrder(row.id);
    return {
      ...detail,
      payment: payment
        ? {
            out_trade_no: payment.out_trade_no,
            transaction_id: payment.transaction_id,
            trade_state: payment.trade_state,
            paid_at: payment.success_time ? iso(payment.success_time) : null,
          }
        : null,
      reservations: reservations.map((r) => ({
        sku_id: r.sku_id,
        quantity: r.quantity,
        status: r.status,
      })),
    };
  }
  private async list(
    p: C.ListMyOrdersPayload,
    filter: OrderFilter,
    scope: string,
    admin: boolean,
  ): Promise<C.OrderPage> {
    const cursor = this.tokens.decode(p.page_token, scope);
    const offset = cursor ? Number(cursor.id) - 1 : 0;
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new AppError("INVALID_ARGUMENT", "分页标识无效");
    const rows = await this.daos.orders.listAdmin(
      filter,
      p.page_size + 1,
      offset,
    );
    const visible = rows.slice(0, p.page_size);
    const items = await this.daos.orderItems.listByOrderIds(
      visible.map((r) => r.id),
    );
    return {
      orders: visible.map((row) => {
        const summary = items
          .filter((i) => i.order_id === row.id)
          .map(
            (i) =>
              `${String(this.record(i.item_snapshot).name ?? "商品")} × ${i.quantity}`,
          )
          .join("，");
        const address = this.record(row.address_snapshot);
        return {
          order_no: row.order_no,
          payment_mode: row.payment_mode,
          status: row.status,
          total_amount_cent: money(row.total_amount_cent),
          payment_deadline_at: row.payment_deadline_at
            ? iso(row.payment_deadline_at)
            : null,
          item_summary: summary,
          created_at: iso(row.created_at),
          ...(admin
            ? {
                receiver_name: String(address.receiver_name ?? ""),
                phone_masked: maskPhone(String(address.phone ?? "")),
                paid_at: row.paid_at ? iso(row.paid_at) : null,
              }
            : {}),
        };
      }),
      next_page_token:
        rows.length > p.page_size
          ? this.tokens.encode(scope, { id: String(offset + p.page_size + 1) })
          : null,
    };
  }
  async listMyOrders(
    p: C.ListMyOrdersPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.OrderPage> {
    const owner = requireWechat(identity);
    validateTransactionPayload("listMyOrders", p);
    const filter: OrderFilter = {
      openid: owner,
      ...(p.status ? { status: p.status } : {}),
    };
    return this.list(
      p,
      filter,
      JSON.stringify(["myOrders", owner, p.status]),
      false,
    );
  }
  async listAdminOrders(
    p: C.ListAdminOrdersPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.OrderPage> {
    const operator = await this.access.requireEnabledAdmin(identity);
    validateTransactionPayload("listAdminOrders", p);
    const filter: OrderFilter = {
      ...(p.status ? { status: p.status } : {}),
      ...(p.order_no ? { orderNo: p.order_no } : {}),
      ...(p.created_from
        ? { createdFrom: sqlTime(new Date(p.created_from)) }
        : {}),
      ...(p.created_to ? { createdTo: sqlTime(new Date(p.created_to)) } : {}),
    };
    return this.list(
      p,
      filter,
      JSON.stringify(["adminOrders", operator.auth_uid, filter]),
      true,
    );
  }
  async shipOrder(
    p: C.ShipOrderPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.ShippedOrder> {
    await this.access.requireEnabledAdmin(identity);
    validateTransactionPayload("shipOrder", p);
    return this.uow.run(async (d) => {
      const row = this.visible(await d.orders.findByOrderNo(p.order_no, true));
      if (row.status === "SHIPPED") {
        if (
          row.carrier_name !== p.carrier_name ||
          row.tracking_no !== p.tracking_no
        )
          throw new AppError("SHIPMENT_CONFLICT", "订单已使用其他运单发货");
        if (!row.shipped_at)
          throw new AppError("INVALID_ORDER_STATE", "订单发货状态无效");
        return {
          order_no: row.order_no,
          status: "SHIPPED",
          carrier_name: p.carrier_name,
          tracking_no: p.tracking_no,
          shipped_at: iso(row.shipped_at),
        };
      }
      if (
        row.status !== "READY_TO_SHIP" ||
        (row.payment_mode === "WECHAT" && !row.paid_at)
      )
        throw new AppError("INVALID_ORDER_STATE", "订单尚不可发货");
      const at = await d.orders.now();
      if (
        (await d.orders.updateShipment(row.id, "READY_TO_SHIP", {
          status: "SHIPPED",
          carrier_name: p.carrier_name,
          tracking_no: p.tracking_no,
          shipped_at: sqlTime(at),
        })) !== 1
      )
        throw new AppError("INVALID_ORDER_STATE", "订单状态已变化");
      return {
        order_no: row.order_no,
        status: "SHIPPED",
        carrier_name: p.carrier_name,
        tracking_no: p.tracking_no,
        shipped_at: at.toISOString(),
      };
    });
  }
  async completeOrder(
    p: C.OrderNoPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.CompletedOrder> {
    await this.access.requireEnabledAdmin(identity);
    validateTransactionPayload("completeOrder", p);
    return this.uow.run(async (d) => {
      const candidate = this.visible(await d.orders.findByOrderNo(p.order_no));
      // Mandatory account context is acquired before ANY order lock/transition.
      const locks = await this.referral.lockCompletionAccounts(
        d,
        candidate._openid,
      );
      const row = this.visible(await d.orders.findByOrderNo(p.order_no, true));
      if (row._openid !== candidate._openid)
        throw new AppError("CONFLICT", "订单归属已变化");
      const rewarded = async () => {
        const event = await d.pointsLedger.findByEventKey(
          `REFERRAL_FIRST_COMPLETED_ORDER:${row.order_no}`,
        );
        return event ? money(event.points_delta) : 0;
      };
      if (row.status === "COMPLETED") {
        if (!row.completed_at)
          throw new AppError("INVALID_ORDER_STATE", "订单完成状态无效");
        return {
          order_no: row.order_no,
          status: "COMPLETED",
          completed_at: iso(row.completed_at),
          referral_reward_points: await rewarded(),
          idempotent_replay: true,
        };
      }
      if (row.status !== "SHIPPED")
        throw new AppError("INVALID_ORDER_STATE", "只有已发货订单可以确认完成");
      const at = await d.orders.now();
      if (
        (await d.orders.updateState(row.id, "SHIPPED", {
          status: "COMPLETED",
          paid_at: row.paid_at,
          shipped_at: row.shipped_at,
          completed_at: sqlTime(at),
          closed_at: row.closed_at,
        })) !== 1
      )
        throw new AppError("INVALID_ORDER_STATE", "订单状态已变化");
      await this.referral.grantFirstCompletedOrderReward(
        d,
        row.order_no,
        locks,
      );
      return {
        order_no: row.order_no,
        status: "COMPLETED",
        completed_at: at.toISOString(),
        referral_reward_points: await rewarded(),
        idempotent_replay: false,
      };
    });
  }
}
