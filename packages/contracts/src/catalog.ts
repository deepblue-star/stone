export type CatalogType = 'BEAD' | 'ACCESSORY' | 'STANDARD';
export interface SpecSchema { dimensions: { key: string; label: string; options: { value: string; label: string }[] }[] }
export type SpecValues = Record<string, string>;
export interface CatalogImageUrls { image_urls?: Record<string, string> }
export interface Page<T> extends CatalogImageUrls { items: T[]; next_page_token: string | null }
export interface PaginationPayload { page_token: string | null; page_size: number }
export interface ListAdminCategoriesPayload extends PaginationPayload { catalog_type: CatalogType | null }
export interface ListAdminItemsPayload extends PaginationPayload { category_id: string | null; name_keyword: string | null; is_on_sale: boolean | null }
export interface GetItemPayload { item_id: string }
export interface SaveCategoryPayload { category_id: string | null; catalog_type: CatalogType; name: string; sort_order: number; is_enabled: boolean }
export interface SaveCatalogItemPayload { item_id: string | null; category_id: string; name: string; description: string | null; images: string[]; spec_schema: SpecSchema | null; is_on_sale: boolean }
export interface SaveCatalogSkuPayload { sku_id: string | null; item_id: string; spec_values: SpecValues | null; diameter_mm: number | null; image_file_id: string | null; price_cent: number; is_on_sale: boolean; points_exchange_enabled: boolean; points_cost: number | null; deactivation_impact_hash: string | null }
export type DeactivationOperation = 'OFF_SALE' | 'DELETE';
export interface PreviewSkuDeactivationPayload { sku_id: string; operation: DeactivationOperation }
export interface DeleteCategoryPayload { category_id: string }
export interface DeleteCatalogItemPayload { item_id: string }
export interface DeleteCatalogSkuPayload { sku_id: string; impact_hash: string }
export interface AdjustInventoryPayload { operation_key: string; sku_id: string; stock_delta: number; remark: string }
export interface ListInventoryMovementsPayload extends PaginationPayload { sku_id: string }
export interface ListStandardItemsPayload extends PaginationPayload { category_id: string | null; name_keyword?: string | null }
export interface ListDiyMaterialsPayload { catalog_type: 'BEAD' | 'ACCESSORY'; category_id: string | null }
export interface AdminCategory { category_id: string; catalog_type: CatalogType; name: string; sort_order: number; is_enabled: boolean; item_count: number; updated_at: string }
export interface AdminItemSummary { item_id: string; category_id: string; catalog_type: CatalogType; name: string; is_on_sale: boolean; sku_count: number; stock_total: number; stock_reserved: number; updated_at: string }
export interface InventoryStock { sku_id: string; stock_total: number; stock_reserved: number; available_stock: number }
export interface SavedCatalogSku { sku_id: string; item_id: string; spec_values: SpecValues | null; spec_signature: string | null; diameter_mm: number | null; image_file_id: string | null; price_cent: number; is_on_sale: boolean; points_exchange_enabled: boolean; points_cost: number | null; updated_at: string }
export interface AdminCatalogSku extends SavedCatalogSku, InventoryStock {}
export interface AdminCatalogItem extends CatalogImageUrls { item_id: string; category_id: string; catalog_type: CatalogType; name: string; description: string | null; images: string[]; spec_schema: SpecSchema | null; is_on_sale: boolean; skus: AdminCatalogSku[]; updated_at: string }
export interface SkuDeactivationPreview { sku_id: string; operation: DeactivationOperation; stock_reserved: number; pending_order_count: number; can_execute: boolean; available_coupon_count: number; refundable_points: number; affected_accounts: { account_id: string; openid_masked: string; coupon_count: number; refund_points: number }[]; impact_hash: string | null }
export interface SkuDeactivationResult { sku_id: string; operation: DeactivationOperation; is_on_sale: boolean; is_deleted: boolean; refunded_coupon_count: number; refunded_points: number; affected_account_count: number; idempotent_replay: boolean }
export interface InventoryMovement { action: 'ADMIN_ADJUST' | 'RESERVE' | 'CONSUME' | 'RELEASE'; stock_delta: number; reserved_delta: number; order_id: string | null; operator_uid: string | null; remark: string | null; created_at: string }
export interface InventoryMovementPage { movements: InventoryMovement[]; next_page_token: string | null }
export interface StandardCategory { id: string; name: string; sort_order: number; item_count?: number; cover_file_id?: string | null }
export interface StandardItemSummary { item_id: string; name: string; cover_file_id: string | null; min_price_cent: number | null; has_available_sku: boolean }
export interface StandardItemDetail extends CatalogImageUrls { item_id: string; name: string; description: string | null; images: string[]; spec_schema: SpecSchema; skus: { sku_id: string; spec_values: SpecValues; price_cent: number; available_stock: number; image_file_id: string | null }[] }
export interface DiyMaterials extends CatalogImageUrls { categories: StandardCategory[]; items: { id: string; category_id: string; name: string; is_on_sale: boolean; skus: { id: string; diameter_mm: number | null; price_cent: number; available_stock: number; is_on_sale: boolean; image_file_id: string | null }[] }[] }
export type CatalogErrorCode = 'CATALOG_TYPE_CONFLICT' | 'SPEC_SCHEMA_MISMATCH' | 'SKU_SPEC_ALREADY_EXISTS' | 'SKU_HAS_PENDING_ORDERS' | 'SKU_DEACTIVATION_IMPACT_CHANGED' | 'SKU_COUPON_STATE_CONFLICT' | 'ITEM_UNAVAILABLE' | 'INVALID_CATALOG_DATA';
