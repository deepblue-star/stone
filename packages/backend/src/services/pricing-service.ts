import type * as C from "../../../contracts/src/index";
import type {
  AddressRow,
  CartTarget,
  DaoSet,
  SkuCouponRow,
} from "../dao/index";
import type { SkuRow } from "../catalog/dao";
import { compareId, json } from "../catalog/rules";
import { AppError, isRecord } from "../errors";
import {
  decodeComponents,
  loadMaterials,
  material,
  snapshot,
  specText,
  unavailable,
} from "./buyer-rules";
import { hash, maskPhone, money } from "./transaction-rules";
export interface CheckoutTarget extends CartTarget {
  quantity: number;
  cart_item_id?: string;
}
interface ResolvedTarget extends CheckoutTarget {
  name: string;
  components: string[];
  image_file_id: string | null;
  version_no?: number;
}
export interface PricedLine {
  model: C.CheckoutLine;
  target: CheckoutTarget;
  unit: bigint;
  snapshot: Record<string, unknown>;
  couponIds: string[];
  coupons: C.AppliedSkuCoupon[];
  couponAllocations: {
    coupon_id: string;
    sku_id: string;
    position: number;
    free_quantity: 1;
    unit_price_cent: C.AmountCent;
    discount_amount_cent: C.AmountCent;
  }[];
}
export interface PricedCheckout {
  quote: C.CheckoutQuote;
  address: Record<string, unknown>;
  lines: PricedLine[];
  required: Map<string, number>;
  skus: Map<string, SkuRow>;
  couponIds: string[];
}
/** Read-only pricing by default; transactional callers request ordered catalog/account/coupon locks. */
export class PricingService {
  async quote(
    d: DaoSet,
    openid: string,
    targets: readonly CheckoutTarget[],
    addressId: string,
    lock = false,
  ): Promise<PricedCheckout> {
    const address = await d.addresses.findByOwnerId(openid, addressId);
    if (!address) throw new AppError("NOT_FOUND", "收货地址不存在");
    const resolved: ResolvedTarget[] = [];
    for (const target of targets) {
      if (target.item_type === "STANDARD" && target.sku_id) {
        resolved.push({
          ...target,
          components: [target.sku_id],
          name: "",
          image_file_id: null,
        });
        continue;
      }
      if (!target.design_version_id)
        throw new AppError("INVALID_ARGUMENT", "购买目标无效");
      const version = await d.designVersions.findById(target.design_version_id);
      if (!version) throw new AppError("NOT_FOUND", "设计版本不存在");
      const design = await d.designs.findByOwnerId(openid, version.design_id);
      if (!design) throw new AppError("FORBIDDEN", "无权访问该设计");
      const components = decodeComponents(version.components);
      resolved.push({
        ...target,
        components: components.map((c) => c.sku_id),
        name: design.name,
        image_file_id: version.thumbnail_file_id,
        version_no: version.version_no,
      });
    }
    const ids = [...new Set(resolved.flatMap((t) => t.components))].sort(
      compareId,
    );
    const materials = await loadMaterials(d, ids);
    if (lock) {
      // Discover parents without locks, then lock each hierarchy level numerically.
      for (const id of [...materials.categories.keys()].sort(compareId)) {
        const row = await d.categories.findById(id, true);
        if (row) materials.categories.set(id, row);
      }
      for (const id of [...materials.items.keys()].sort(compareId)) {
        const row = await d.items.findById(id, true);
        if (row) materials.items.set(id, row);
      }
      materials.skus = new Map(
        (await d.skus.findByIds(ids, true)).map((row) => [row.id, row]),
      );
    }
    const required = new Map<string, number>();
    for (const t of resolved)
      for (const id of t.components) {
        const count = (required.get(id) ?? 0) + t.quantity;
        if (!Number.isSafeInteger(count) || count > 2147483647)
          throw new AppError("INVALID_ARGUMENT", "购买数量超出范围");
        required.set(id, count);
        const m = material(materials, id);
        if (
          unavailable(
            m.sku,
            m.item,
            m.category,
            t.item_type === "STANDARD" ? "STANDARD" : "MATERIAL",
          )
        )
          throw new AppError("ITEM_UNAVAILABLE", "商品或设计材料已不可购买");
      }
    for (const [id, count] of required) {
      const sku = materials.skus.get(id)!;
      if (sku.stock_total - sku.stock_reserved < count)
        throw new AppError("INSUFFICIENT_STOCK", "可用库存不足");
    }
    const designSkuIds = [
      ...new Set(
        resolved
          .filter((t) => t.item_type === "DESIGN")
          .flatMap((t) => t.components),
      ),
    ]
      .filter((id) => material(materials, id).category?.catalog_type === "BEAD")
      .sort(compareId);
    const account = await d.pointsAccounts.findByOpenId(openid);
    if (lock && account && !(await d.pointsAccounts.findForUpdate(account.id)))
      throw new AppError("CONFLICT", "积分账户已变化");
    const available = account
      ? [
          ...(await d.skuCoupons.listAvailableForCheckout(
            account.id,
            designSkuIds,
            lock,
          )),
        ]
          .filter(
            (c) =>
              c.status === "AVAILABLE" &&
              !c.is_deleted &&
              c.account_id === account.id &&
              designSkuIds.includes(c.sku_id),
          )
          .sort((a, b) => compareId(a.id, b.id))
      : [];
    const pools = new Map<string, SkuCouponRow[]>();
    for (const c of available) {
      const pool = pools.get(c.sku_id) ?? [];
      pool.push(c);
      pools.set(c.sku_id, pool);
    }
    let goods = 0n;
    let discount = 0n;
    const couponIds: string[] = [];
    const lines: PricedLine[] = [];
    for (const t of resolved) {
      let unit = 0n;
      let lineDiscount = 0n;
      const allocated: string[] = [];
      const couponAllocations: PricedLine["couponAllocations"] = [];
      const allocation = new Map<string, { qty: number; price: bigint }>();
      const componentSnapshots = t.components.map((id, position) => {
        const { sku, item } = material(materials, id);
        const price = BigInt(sku!.price_cent);
        money(price);
        unit += price;
        if (t.item_type === "DESIGN" && designSkuIds.includes(id)) {
          const used = (pools.get(id) ?? []).splice(0, t.quantity);
          allocated.push(...used.map((c) => c.id));
          couponAllocations.push(
            ...used.map((c) => ({
              coupon_id: c.id,
              sku_id: id,
              position,
              free_quantity: 1 as const,
              unit_price_cent: money(price),
              discount_amount_cent: money(price),
            })),
          );
          lineDiscount += BigInt(used.length) * price;
          if (used.length)
            allocation.set(id, {
              qty: (allocation.get(id)?.qty ?? 0) + used.length,
              price,
            });
        }
        return {
          sku_id: id,
          position,
          ...snapshot(sku!, item!),
          unit_price_cent: money(price),
        };
      });
      const first = material(materials, t.components[0]!);
      const name = t.item_type === "STANDARD" ? first.item!.name : t.name;
      const image = t.image_file_id ?? componentSnapshots[0]!.image_file_id;
      const gross = unit * BigInt(t.quantity);
      goods += gross;
      discount += lineDiscount;
      couponIds.push(...allocated);
      const coupons = [...allocation]
        .sort(([a], [b]) => compareId(a, b))
        .map(([id, a]) => ({
          sku_id: id,
          free_quantity: a.qty,
          unit_price_cent: money(a.price),
          discount_amount_cent: money(a.price * BigInt(a.qty)),
        }));
      const itemSnapshot: Record<string, unknown> = {
        name,
        image_file_id: image,
        components: componentSnapshots,
      };
      if (t.item_type === "STANDARD")
        itemSnapshot.spec_text = specText(first.sku!, first.item!);
      else {
        itemSnapshot.design_version_id = t.design_version_id;
        itemSnapshot.version_no = t.version_no;
      }
      lines.push({
        target: t,
        unit,
        snapshot: itemSnapshot,
        couponIds: allocated,
        coupons,
        couponAllocations,
        model: {
          source_type: t.item_type,
          source_id: (t.sku_id ?? t.design_version_id)!,
          ...(t.cart_item_id ? { cart_item_id: t.cart_item_id } : {}),
          name,
          quantity: t.quantity,
          image_file_id: image,
          gross_amount_cent: money(gross),
          discount_amount_cent: money(lineDiscount),
          line_amount_cent: money(gross - lineDiscount),
          purchasable: true,
          unavailable_reason: null,
          applied_sku_coupons: coupons,
        },
      });
    }
    const shipping = await this.calculateShippingFee(d, address.province_code);
    const savedAddress = this.addressSnapshot(address);
    const total = goods - discount + shipping;
    const quoteHash = hash({
      targets: lines.map((l, index) => ({
        cart_item_id: l.target.cart_item_id ?? null,
        item_type: l.target.item_type,
        sku_id: l.target.sku_id,
        design_version_id: l.target.design_version_id,
        quantity: l.target.quantity,
        components: resolved[index]!.components,
      })),
      address: savedAddress,
      prices: ids.map((id) => ({
        sku_id: id,
        price_cent: String(materials.skus.get(id)!.price_cent),
      })),
      allocations: lines.map((l) => l.couponAllocations),
      shipping_fee_cent: shipping.toString(),
    });
    return {
      address: savedAddress,
      lines,
      required,
      skus: materials.skus,
      couponIds,
      quote: {
        items: lines.map((l) => l.model),
        address: {
          address_id: address.id,
          receiver_name: address.receiver_name,
          phone_masked: maskPhone(address.phone),
          full_address: String(savedAddress.full_address),
        },
        goods_amount_cent: money(goods),
        discount_amount_cent: money(discount),
        shipping_fee_cent: money(shipping),
        total_amount_cent: money(total),
        quote_hash: quoteHash,
      },
    };
  }
  private addressSnapshot(a: AddressRow): Record<string, unknown> {
    return {
      receiver_name: a.receiver_name,
      phone: a.phone,
      province_code: a.province_code,
      province: a.province,
      city_code: a.city_code,
      city: a.city,
      district_code: a.district_code,
      district: a.district,
      address_line: a.address_line,
      full_address: `${a.province}${a.city}${a.district}${a.address_line}`,
    };
  }
  async calculateShippingFee(d: DaoSet, province: string): Promise<bigint> {
    const config = await d.siteConfig.findByKey("shipping_rules");
    if (!config) throw new AppError("CONFIG_INVALID", "配送规则未配置");
    const value = json(config.config_value);
    if (!isRecord(value) || !Array.isArray(value.regions))
      throw new AppError("CONFIG_INVALID", "配送规则无效");
    const seen = new Set<string>();
    let fee: bigint | undefined;
    for (const row of value.regions) {
      if (
        !isRecord(row) ||
        typeof row.province_code !== "string" ||
        seen.has(row.province_code) ||
        typeof row.enabled !== "boolean" ||
        typeof row.shipping_fee_cent !== "number" ||
        !Number.isSafeInteger(row.shipping_fee_cent) ||
        row.shipping_fee_cent < 0
      )
        throw new AppError("CONFIG_INVALID", "配送规则无效");
      seen.add(row.province_code);
      if (row.province_code === province && row.enabled)
        fee = BigInt(row.shipping_fee_cent);
    }
    if (fee === undefined)
      throw new AppError("SHIPPING_UNAVAILABLE", "该省份当前不可配送");
    return fee;
  }
}
