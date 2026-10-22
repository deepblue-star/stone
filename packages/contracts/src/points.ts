/** BIGINT account/ledger amounts remain decimal strings at the JSON boundary. */
export type PointsErrorCode = 'SELF_REFERRAL' | 'REFERRAL_ALREADY_BOUND' | 'REFERRAL_BINDING_CLOSED' | 'INSUFFICIENT_POINTS' | 'ITEM_UNAVAILABLE';
export type PointsSourceType = 'DAILY_CHECK_IN' | 'REFERRAL_FIRST_COMPLETED_ORDER' | 'POINTS_EXCHANGE' | 'POINTS_EXCHANGE_REFUND';
export type CouponStatus = 'AVAILABLE' | 'LOCKED' | 'USED' | 'REFUNDED';
export interface PointsPagePayload { page_token: string | null; page_size: number }
export interface PointsLedgerPayload extends PointsPagePayload { source_type?: PointsSourceType | null; direction?: 'EARN' | 'SPEND' | null }
export interface ExchangeSkusPayload extends PointsPagePayload { category_id: string | null }
export interface ExchangePointsPayload { exchange_key: string; sku_id: string }
export interface ListSkuCouponsPayload extends PointsPagePayload { status: CouponStatus | null }
export interface BindReferrerPayload { invite_code: string; bind_channel: 'SHARE_PATH' | 'MANUAL_CODE' }
export interface PointsLedgerSummary { points_delta: string; source_type: string; description: string; created_at: string }
export interface PointsLedgerEntry extends PointsLedgerSummary { balance_after: string }
export interface PointsCenter { balance: string; total_earned: string; total_spent: string; checked_in_today: boolean; recent_ledger: PointsLedgerSummary[] }
export interface CheckInResult { awarded_points: number; balance: string; checked_in_date: string; idempotent_replay: boolean }
export interface PointsLedgerPage { items: PointsLedgerEntry[]; next_page_token: string | null }
export interface PointsExchangeSku { sku_id: string; item_name: string; diameter_mm: number | null; image_file_id: string | null; points_cost: number; available_stock: number }
export interface PointsExchangePage { items: PointsExchangeSku[]; next_page_token: string | null; image_urls?: Record<string, string> }
export interface ExchangePointsResult { coupon_id: string; sku_id: string; status: CouponStatus; points_cost: number; points_balance: string; idempotent_replay: boolean }
export interface MyInviteInfo { invite_code: string; share_path: string; bound_referrer: boolean; invited_user_count: number; rewarded_user_count: number }
export interface BindReferrerResult { relation_id: string; bound: true; idempotent_replay: boolean }
export interface MySkuCoupon { coupon_id: string; sku_id: string; item_name: string; diameter_mm: number | null; image_file_id: string | null; status: CouponStatus; locked_order_no: string | null; used_order_no: string | null; refunded_points: number | null; refunded_at: string | null; refund_reason: string | null; unavailable_reason: string | null; created_at: string }
export interface MySkuCouponPage { coupons: MySkuCoupon[]; next_page_token: string | null; image_urls?: Record<string, string> }
export interface AvailableSkuCoupon { sku_id: string; available_count: number }
export interface ProfileSummary { design_count: number; cart_item_count: number; order_counts: Record<'PENDING_PAYMENT' | 'READY_TO_SHIP' | 'SHIPPED' | 'COMPLETED' | 'CLOSED', number>; points: Pick<PointsCenter, 'balance' | 'checked_in_today' | 'recent_ledger'> & { invite_code: string }; sku_coupons: { available_count: number; locked_count: number }; recent_order: { order_no: string; status: string; total_amount_cent: string; created_at: string } | null; customer_service: { wechat_id: string; qr_file_id: string } | null }
