import { randomBytes } from "node:crypto";
import type * as C from "../../../contracts/src/index";
import type { DaoSet, OrderRow } from "../dao/index";
import type { UnitOfWork } from "../db/unit-of-work";
import {
  noImageUrls,
  selectedImages,
  type ImageUrlResolver,
} from "../catalog/images";
import { compareId, iso, json } from "../catalog/rules";
import { AppError, isRecord } from "../errors";
import { canonicalId, requireWechat } from "./buyer-rules";
import {
  PricingService,
  type CheckoutTarget,
  type PricedCheckout,
} from "./pricing-service";
import {
  hash,
  money,
  sqlTime,
  validateTransactionPayload,
} from "./transaction-rules";
export interface CheckoutServiceOptions {
  images?: ImageUrlResolver;
  orderNo?: () => string;
}
export class CheckoutChangedError extends AppError {
  constructor(readonly quote: C.CheckoutQuote) {
    super("CHECKOUT_CHANGED", "结算内容已变化，请确认最新报价");
  }
}
export class CheckoutService {
  private readonly images: ImageUrlResolver;
  private readonly pricing = new PricingService();
  constructor(
    private readonly daos: DaoSet,
    private readonly uow: UnitOfWork<DaoSet>,
    private readonly options: CheckoutServiceOptions = {},
  ) {
    this.images = options.images ?? noImageUrls;
  }
  private direct(p: C.PreviewDirectOrderPayload): CheckoutTarget {
    return {
      item_type: p.item_type,
      sku_id: p.item_type === "STANDARD" ? canonicalId(p.sku_id!) : null,
      design_version_id:
        p.item_type === "DESIGN" ? canonicalId(p.design_version_id!) : null,
      quantity: p.quantity,
    };
  }
  private async cart(
    d: DaoSet,
    owner: string,
    ids: readonly string[],
    lock = false,
  ): Promise<CheckoutTarget[]> {
    const rows = await d.cart.findSelected(owner, ids, lock);
    if (rows.length !== ids.length)
      throw new AppError("NOT_FOUND", "购物车条目不存在");
    return [...rows]
      .sort((a, b) => compareId(a.id, b.id))
      .map((r) => ({
        item_type: r.item_type,
        sku_id: r.sku_id,
        design_version_id: r.design_version_id,
        quantity: r.quantity,
        cart_item_id: r.id,
      }));
  }
  private async display(priced: PricedCheckout): Promise<C.CheckoutQuote> {
    return {
      ...priced.quote,
      image_urls: await this.images.resolve(
        selectedImages(
          priced.lines.flatMap((l) => [
            l.model.image_file_id,
            ...(Array.isArray(l.snapshot.components)
              ? l.snapshot.components
                  .filter(isRecord)
                  .map((c) =>
                    typeof c.image_file_id === "string"
                      ? c.image_file_id
                      : null,
                  )
              : []),
          ]),
        ),
      ),
    };
  }
  async previewOrderFromCart(
    p: C.PreviewOrderFromCartPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.CheckoutQuote> {
    const owner = requireWechat(identity);
    validateTransactionPayload("previewOrderFromCart", p);
    const ids = p.cart_item_ids.map(canonicalId).sort(compareId);
    return this.display(
      await this.pricing.quote(
        this.daos,
        owner,
        await this.cart(this.daos, owner, ids),
        canonicalId(p.address_id),
      ),
    );
  }
  async previewDirectOrder(
    p: C.PreviewDirectOrderPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.CheckoutQuote> {
    const owner = requireWechat(identity);
    validateTransactionPayload("previewDirectOrder", p);
    return this.display(
      await this.pricing.quote(
        this.daos,
        owner,
        [this.direct(p)],
        canonicalId(p.address_id),
      ),
    );
  }
  async createOrderFromCart(
    p: C.CreateOrderFromCartPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.CreatedOrder> {
    const owner = requireWechat(identity);
    validateTransactionPayload("createOrderFromCart", p);
    const targets = p.cart_items
      .map((r) => ({
        cart_item_id: canonicalId(r.cart_item_id),
        quantity: r.quantity,
      }))
      .sort((a, b) => compareId(a.cart_item_id, b.cart_item_id));
    return this.create(
      owner,
      p,
      hash({
        mode: "CART",
        cart_items: targets,
        address_id: canonicalId(p.address_id),
      }),
      async (d) => {
        const rows = await this.cart(
          d,
          owner,
          targets.map((t) => t.cart_item_id),
          true,
        );
        if (rows.some((r, i) => r.quantity !== targets[i]!.quantity))
          throw new AppError(
            "CHECKOUT_CHANGED",
            "购物车数量已变化，请重新确认",
          );
        return rows;
      },
      () =>
        this.previewOrderFromCart(
          {
            cart_item_ids: targets.map((t) => t.cart_item_id),
            address_id: p.address_id,
          },
          identity,
        ),
    );
  }
  async createDirectOrder(
    p: C.CreateDirectOrderPayload,
    identity: C.TrustedIdentity,
  ): Promise<C.CreatedOrder> {
    const owner = requireWechat(identity);
    validateTransactionPayload("createDirectOrder", p);
    const target = this.direct(p);
    return this.create(
      owner,
      p,
      hash({ mode: "DIRECT", target, address_id: canonicalId(p.address_id) }),
      async () => [target],
      () =>
        this.previewDirectOrder(
          {
            item_type: target.item_type,
            sku_id: target.sku_id,
            design_version_id: target.design_version_id,
            quantity: target.quantity,
            address_id: p.address_id,
          },
          identity,
        ),
    );
  }
  private async result(
    d: DaoSet,
    row: OrderRow,
    replay: boolean,
  ): Promise<C.CreatedOrder> {
    const items = await d.orderItems.listByOrder(row.id);
    const grouped = new Map<
      string,
      { qty: number; amount: bigint; price: bigint }
    >();
    for (const item of items) {
      const promotion = json(item.promotion_snapshot);
      if (!isRecord(promotion) || !Array.isArray(promotion.sku_coupons))
        continue;
      for (const c of promotion.sku_coupons) {
        if (!isRecord(c) || typeof c.sku_id !== "string") continue;
        const prior = grouped.get(c.sku_id) ?? {
          qty: 0,
          amount: 0n,
          price: BigInt(String(c.unit_price_cent)),
        };
        prior.qty += Number(c.free_quantity);
        prior.amount += BigInt(String(c.discount_amount_cent));
        grouped.set(c.sku_id, prior);
      }
    }
    return {
      order_no: row.order_no,
      payment_mode: row.payment_mode,
      status: row.status,
      goods_amount_cent: money(row.goods_amount_cent),
      discount_amount_cent: money(row.discount_amount_cent),
      shipping_fee_cent: money(row.shipping_fee_cent),
      total_amount_cent: money(row.total_amount_cent),
      applied_sku_coupons: [...grouped]
        .sort(([a], [b]) => compareId(a, b))
        .map(([id, c]) => ({
          sku_id: id,
          free_quantity: c.qty,
          unit_price_cent: money(c.price),
          discount_amount_cent: money(c.amount),
        })),
      requires_payment:
        row.payment_mode === "WECHAT" && row.status === "PENDING_PAYMENT",
      payment_deadline_at: row.payment_deadline_at
        ? iso(row.payment_deadline_at)
        : null,
      idempotent_replay: replay,
    };
  }
  private async create(
    owner: string,
    p: { checkout_key: string; quote_hash: string; address_id: string },
    requestHash: string,
    targets: (d: DaoSet) => Promise<CheckoutTarget[]>,
    refreshQuote: () => Promise<C.CheckoutQuote>,
  ): Promise<C.CreatedOrder> {
    const replay = async (d: DaoSet, row: OrderRow) => {
      if (row.checkout_request_hash !== requestHash)
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "提交标识已用于其他结算内容",
        );
      return this.result(d, row, true);
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const prior = await this.daos.orders.findByCheckoutKey(
        owner,
        p.checkout_key,
      );
      if (prior) return replay(this.daos, prior);
      try {
        return await this.uow.run(async (d) => {
          const selected = await targets(d);
          const priced = await this.pricing.quote(
            d,
            owner,
            selected,
            canonicalId(p.address_id),
            true,
          );
          const prior = await d.orders.findByCheckoutKey(
            owner,
            p.checkout_key,
            true,
          );
          if (prior) return replay(d, prior);
          if (priced.quote.quote_hash !== p.quote_hash)
            throw new CheckoutChangedError(priced.quote);
          const rules = await d.siteConfig.findByKey("payment_rules");
          const config = rules ? json(rules.config_value) : null;
          if (!isRecord(config) || config.payment_timeout_minutes !== 5)
            throw new AppError("CONFIG_INVALID", "支付时限必须为5分钟");
          const now = await d.orders.now();
          const free = BigInt(priced.quote.total_amount_cent) === 0n;
          const no =
            this.options.orderNo?.() ??
            `O${now.toISOString().slice(0, 10).replaceAll("-", "")}${randomBytes(10).toString("hex")}`;
          const input = {
            order_no: no,
            _openid: owner,
            checkout_key: p.checkout_key,
            checkout_request_hash: requestHash,
            quote_hash: priced.quote.quote_hash,
            payment_mode: free ? ("ZERO_PAY" as const) : ("WECHAT" as const),
            status: free
              ? ("READY_TO_SHIP" as const)
              : ("PENDING_PAYMENT" as const),
            goods_amount_cent: String(priced.quote.goods_amount_cent),
            discount_amount_cent: String(priced.quote.discount_amount_cent),
            shipping_fee_cent: String(priced.quote.shipping_fee_cent),
            total_amount_cent: String(priced.quote.total_amount_cent),
            address_snapshot: priced.address,
            payment_deadline_at: free
              ? null
              : sqlTime(new Date(now.getTime() + 300000)),
            paid_at: null,
            carrier_name: null,
            tracking_no: null,
            shipped_at: null,
            completed_at: null,
            closed_at: null,
          };
          const orderId = await d.orders.insert(input);
          const ordered = [...priced.required].sort(([a], [b]) =>
            compareId(a, b),
          );
          for (const [id, quantity] of ordered) {
            const sku = priced.skus.get(id)!;
            const affected = await d.skus.updateStockCounters(
              id,
              sku.stock_total,
              sku.stock_reserved,
              {
                stock_total: free
                  ? sku.stock_total - quantity
                  : sku.stock_total,
                stock_reserved: free
                  ? sku.stock_reserved
                  : sku.stock_reserved + quantity,
              },
            );
            if (affected !== 1)
              throw new AppError("INSUFFICIENT_STOCK", "库存已变化");
          }
          const lineRows = priced.lines.map((l) => ({
            order_id: orderId,
            item_type: l.target.item_type,
            sku_id: l.target.sku_id,
            design_version_id: l.target.design_version_id,
            quantity: l.target.quantity,
            unit_price_cent: l.unit.toString(),
            gross_amount_cent: String(l.model.gross_amount_cent),
            discount_amount_cent: String(l.model.discount_amount_cent),
            line_amount_cent: String(l.model.line_amount_cent),
            item_snapshot: l.snapshot,
            promotion_snapshot: {
              coupon_ids: l.couponIds,
              sku_coupons: l.coupons,
              coupon_allocations: l.couponAllocations,
            },
          }));
          if ((await d.orderItems.insertMany(lineRows)) !== lineRows.length)
            throw new AppError("CONFLICT", "订单项目写入失败");
          if (
            (await d.reservations.insertMany(
              ordered.map(([id, quantity]) => ({
                order_id: orderId,
                sku_id: id,
                quantity,
                status: free ? ("CONSUMED" as const) : ("RESERVED" as const),
              })),
            )) !== ordered.length
          )
            throw new AppError("CONFLICT", "库存记录写入失败");
          if (
            (await d.inventoryMovements.insertMany(
              ordered.map(([id, quantity]) => ({
                event_key: `${free ? "CONSUME" : "RESERVE"}:${orderId}:${id}`,
                sku_id: id,
                order_id: orderId,
                action: free ? ("CONSUME" as const) : ("RESERVE" as const),
                stock_delta: free ? -quantity : 0,
                reserved_delta: free ? 0 : quantity,
                operator_uid: null,
                remark: null,
              })),
            )) !== ordered.length
          )
            throw new AppError("CONFLICT", "库存流水写入失败");
          if (
            priced.couponIds.length &&
            (await d.skuCoupons.updateStates(priced.couponIds, "AVAILABLE", {
              status: free ? "USED" : "LOCKED",
              locked_order_id: free ? null : orderId,
              locked_at: free ? null : sqlTime(now),
              used_order_id: free ? orderId : null,
              used_at: free ? sqlTime(now) : null,
              refunded_at: null,
              refund_reason: null,
            })) !== priced.couponIds.length
          )
            throw new AppError("CHECKOUT_CHANGED", "兑换券已变化，请重新确认");
          if (!free)
            await d.payments.insert({
              order_id: orderId,
              out_trade_no: no,
              prepay_id: null,
              transaction_id: null,
              trade_state: null,
              success_time: null,
            });
          const cartIds = selected.flatMap((t) =>
            t.cart_item_id ? [t.cart_item_id] : [],
          );
          if (
            cartIds.length &&
            (await d.cart.softDeleteMany(owner, cartIds)) !== cartIds.length
          )
            throw new AppError("CHECKOUT_CHANGED", "购物车已变化");
          return this.result(
            d,
            {
              ...input,
              id: orderId,
              created_at: now,
              updated_at: now,
              is_deleted: 0,
            },
            false,
          );
        });
      } catch (error) {
        // A competing identical request can commit while we wait for its cart/SKU
        // locks. Its deleted cart or spent coupons must still replay the winner.
        if (
          error instanceof AppError ||
          (isRecord(error) &&
            error.code === "ER_DUP_ENTRY" &&
            /uk_checkout/.test(String(error.sqlMessage ?? error.message ?? "")))
        ) {
          const found = await this.daos.orders.findByCheckoutKey(
            owner,
            p.checkout_key,
          );
          if (found) return replay(this.daos, found);
        }
        if (isRecord(error) && error.code === "ER_LOCK_DEADLOCK") {
          if (attempt < 2) continue;
          throw new AppError("CONFLICT", "结算并发冲突，请重试");
        }
        if (error instanceof AppError && error.code === "CHECKOUT_CHANGED") {
          // run() has rolled back and released all transactional locks. Quote
          // from ordinary reads so cart quantity, price and coupon races all
          // return the newest purchasable state, including its image URLs.
          // A missing address/target or an unavailable item keeps its own error.
          throw new CheckoutChangedError(await refreshQuote());
        }
        throw error;
      }
    }
    throw new AppError("CONFLICT", "结算并发冲突，请重试");
  }
}
