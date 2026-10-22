import type { AmountCent } from "./checkout";
export type OrderStatus =
  "PENDING_PAYMENT" | "READY_TO_SHIP" | "SHIPPED" | "COMPLETED" | "CLOSED";
export interface ListMyOrdersPayload {
  status: OrderStatus | null;
  page_token: string | null;
  page_size: number;
}
export interface ListAdminOrdersPayload extends ListMyOrdersPayload {
  order_no: string | null;
  created_from: string | null;
  created_to: string | null;
}
export interface OrderNoPayload {
  order_no: string;
}
export interface ShipOrderPayload extends OrderNoPayload {
  carrier_name: string;
  tracking_no: string;
}
export interface OrderSummary {
  order_no: string;
  payment_mode: "WECHAT" | "ZERO_PAY";
  status: OrderStatus;
  total_amount_cent: AmountCent;
  payment_deadline_at: string | null;
  item_summary: string;
  created_at: string;
  receiver_name?: string;
  phone_masked?: string;
  paid_at?: string | null;
}
export interface OrderPage {
  orders: OrderSummary[];
  next_page_token: string | null;
}
export interface OrderItem {
  item_type: "STANDARD" | "DESIGN";
  quantity: number;
  gross_amount_cent: AmountCent;
  discount_amount_cent: AmountCent;
  line_amount_cent: AmountCent;
  item_snapshot: Record<string, unknown>;
  promotion_snapshot: Record<string, unknown> | null;
}
export interface Shipping {
  carrier_name: string;
  tracking_no: string;
  shipped_at: string;
}
export interface OrderDetail {
  order_no: string;
  payment_mode: "WECHAT" | "ZERO_PAY";
  status: OrderStatus;
  payment_deadline_at: string | null;
  can_pay: boolean;
  goods_amount_cent: AmountCent;
  discount_amount_cent: AmountCent;
  shipping_fee_cent: AmountCent;
  total_amount_cent: AmountCent;
  items: OrderItem[];
  address_snapshot: Record<string, unknown>;
  shipping: Shipping | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  image_urls?: Record<string, string>;
}
export interface AdminOrderDetail extends OrderDetail {
  payment: {
    out_trade_no: string;
    transaction_id: string | null;
    trade_state: string | null;
    paid_at: string | null;
  } | null;
  reservations: {
    sku_id: string;
    quantity: number;
    status: "RESERVED" | "CONSUMED" | "RELEASED";
  }[];
}
export interface ShippedOrder extends Shipping {
  order_no: string;
  status: "SHIPPED";
}
export interface CompletedOrder {
  order_no: string;
  status: "COMPLETED";
  completed_at: string;
  referral_reward_points: AmountCent;
  idempotent_replay: boolean;
}
