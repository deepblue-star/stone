import type { DesignComponentDetail } from './design';
export interface AddCartItemPayload { item_type: 'STANDARD' | 'DESIGN'; sku_id?: string | null; design_version_id?: string | null; quantity: number }
export interface CartItemPayload { cart_item_id: string }
export interface UpdateCartItemPayload extends CartItemPayload { quantity: number }
export interface CartItemResult { cart_item_id: string; quantity: number }
export interface CartItemDisplay { name: string; spec_text: string; image_file_id: string | null; current_unit_price_cent: number | null; version_no?: number; components?: DesignComponentDetail[] }
export interface CartItem { cart_item_id: string; item_type: 'STANDARD' | 'DESIGN'; sku_id: string | null; design_version_id: string | null; quantity: number; display: CartItemDisplay; purchasable: boolean; unavailable_reason: string | null }
export interface Cart { items: CartItem[]; image_urls?: Record<string, string> }
