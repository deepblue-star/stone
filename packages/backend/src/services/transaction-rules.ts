import { createHash } from "node:crypto";
import { AppError, isRecord } from "../errors";
import { id, integer } from "../catalog/rules";
import type { AmountCent } from "../../../contracts/src/index";
export const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const money = (n: bigint | string): AmountCent => {
  const value = BigInt(n);
  if (value < 0n || value > 18446744073709551615n)
    throw new AppError("INVALID_CATALOG_DATA", "金额超出范围");
  return value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value.toString();
};
export const maskPhone = (phone: string): string =>
  phone.length < 7 ? "****" : `${phone.slice(0, 3)}****${phone.slice(-4)}`;
export const sqlTime = (date: Date): string =>
  date.toISOString().slice(0, 19).replace("T", " ");
const shapes: Record<string, string[]> = {
  previewOrderFromCart: ["cart_item_ids", "address_id"],
  previewDirectOrder: [
    "item_type",
    "sku_id",
    "design_version_id",
    "quantity",
    "address_id",
  ],
  createOrderFromCart: [
    "checkout_key",
    "quote_hash",
    "cart_items",
    "address_id",
  ],
  createDirectOrder: [
    "checkout_key",
    "quote_hash",
    "item_type",
    "sku_id",
    "design_version_id",
    "quantity",
    "address_id",
  ],
  listMyOrders: ["status", "page_token", "page_size"],
  listAdminOrders: [
    "status",
    "order_no",
    "created_from",
    "created_to",
    "page_token",
    "page_size",
  ],
  getMyOrderDetail: ["order_no"],
  getAdminOrderDetail: ["order_no"],
  shipOrder: ["order_no", "carrier_name", "tracking_no"],
  completeOrder: ["order_no"],
};
const invalid = (): never => {
  throw new AppError("INVALID_ARGUMENT", "订单请求字段无效");
};
export function validateTransactionPayload(
  action: string,
  value: unknown,
): Record<string, unknown> {
  const fields = shapes[action];
  if (
    !fields ||
    !isRecord(value) ||
    fields.some(
      (k) => !(k in value) && k !== "sku_id" && k !== "design_version_id",
    ) ||
    Object.keys(value).some((k) => !fields.includes(k))
  )
    return invalid();
  for (const [key, v] of Object.entries(value)) {
    if (key === "address_id" && !id(v)) return invalid();
    if (
      (key === "sku_id" || key === "design_version_id") &&
      v !== null &&
      !id(v)
    )
      return invalid();
    if (key === "quantity" && !integer(v, 1, 2147483647)) return invalid();
    if (key === "item_type" && v !== "STANDARD" && v !== "DESIGN")
      return invalid();
    if (
      key === "checkout_key" &&
      (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v))
    )
      return invalid();
    if (
      key === "quote_hash" &&
      (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    )
      return invalid();
    if (key === "cart_item_ids" || key === "cart_items") {
      if (!Array.isArray(v) || v.length < 1 || v.length > 100) return invalid();
      const ids: string[] = [];
      for (const r of v) {
        const candidate =
          key === "cart_item_ids"
            ? r
            : isRecord(r) &&
                Object.keys(r).length === 2 &&
                integer(r.quantity, 1, 2147483647)
              ? r.cart_item_id
              : null;
        if (!id(candidate)) return invalid();
        ids.push(BigInt(candidate).toString());
      }
      if (new Set(ids).size !== ids.length) return invalid();
    }
    if (
      key === "status" &&
      v !== null &&
      (typeof v !== "string" ||
        ![
          "PENDING_PAYMENT",
          "READY_TO_SHIP",
          "SHIPPED",
          "COMPLETED",
          "CLOSED",
        ].includes(v))
    )
      return invalid();
    if (key === "page_size" && !integer(v, 1, 100)) return invalid();
    if (
      key === "page_token" &&
      v !== null &&
      (typeof v !== "string" || !v.length || v.length > 2048)
    )
      return invalid();
    if (
      key === "order_no" &&
      !(v === null && action === "listAdminOrders") &&
      (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(v))
    )
      return invalid();
    if (
      (key === "created_from" || key === "created_to") &&
      v !== null &&
      (typeof v !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(
          v,
        ) ||
        !Number.isFinite(Date.parse(v)))
    )
      return invalid();
    if (
      key === "carrier_name" &&
      (typeof v !== "string" ||
        !v.trim() ||
        v.length > 80 ||
        /[\r\n\x00-\x1f]/.test(v))
    )
      return invalid();
    if (
      key === "tracking_no" &&
      (typeof v !== "string" || !/^[A-Za-z0-9-]{3,80}$/.test(v))
    )
      return invalid();
  }
  if (
    "item_type" in value &&
    (value.item_type === "STANDARD"
      ? !id(value.sku_id) ||
        (value.design_version_id !== null &&
          value.design_version_id !== undefined)
      : !id(value.design_version_id) ||
        (value.sku_id !== null && value.sku_id !== undefined))
  )
    return invalid();
  if (
    typeof value.created_from === "string" &&
    typeof value.created_to === "string" &&
    Date.parse(value.created_from) > Date.parse(value.created_to)
  )
    return invalid();
  return value;
}
