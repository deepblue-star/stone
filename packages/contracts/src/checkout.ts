/** Amounts remain numbers while exact in JSON, and decimal strings above the safe integer range. */
export type AmountCent = number | string;
export type CheckoutErrorCode =
  | "CHECKOUT_CHANGED"
  | "IDEMPOTENCY_CONFLICT"
  | "SHIPPING_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "INVALID_ORDER_STATE"
  | "SHIPMENT_CONFLICT";
export interface PreviewOrderFromCartPayload {
  cart_item_ids: string[];
  address_id: string;
}
export interface PreviewDirectOrderPayload {
  item_type: "STANDARD" | "DESIGN";
  sku_id?: string | null;
  design_version_id?: string | null;
  quantity: number;
  address_id: string;
}
export interface CreateOrderFromCartPayload {
  checkout_key: string;
  quote_hash: string;
  cart_items: { cart_item_id: string; quantity: number }[];
  address_id: string;
}
export interface CreateDirectOrderPayload extends PreviewDirectOrderPayload {
  checkout_key: string;
  quote_hash: string;
}
export interface AppliedSkuCoupon {
  sku_id: string;
  free_quantity: number;
  unit_price_cent: AmountCent;
  discount_amount_cent: AmountCent;
}
export interface CheckoutLine {
  source_type: "STANDARD" | "DESIGN";
  source_id: string;
  cart_item_id?: string;
  name: string;
  quantity: number;
  image_file_id: string | null;
  gross_amount_cent: AmountCent;
  discount_amount_cent: AmountCent;
  line_amount_cent: AmountCent;
  purchasable: boolean;
  unavailable_reason: string | null;
  applied_sku_coupons: AppliedSkuCoupon[];
}
export interface CheckoutQuote {
  items: CheckoutLine[];
  address: {
    address_id: string;
    receiver_name: string;
    phone_masked: string;
    full_address: string;
  };
  goods_amount_cent: AmountCent;
  discount_amount_cent: AmountCent;
  shipping_fee_cent: AmountCent;
  total_amount_cent: AmountCent;
  quote_hash: string;
  image_urls?: Record<string, string>;
}
export interface CreatedOrder {
  order_no: string;
  payment_mode: "WECHAT" | "ZERO_PAY";
  status: import("./order").OrderStatus;
  goods_amount_cent: AmountCent;
  discount_amount_cent: AmountCent;
  shipping_fee_cent: AmountCent;
  total_amount_cent: AmountCent;
  applied_sku_coupons: AppliedSkuCoupon[];
  requires_payment: boolean;
  payment_deadline_at: string | null;
  idempotent_replay: boolean;
}
