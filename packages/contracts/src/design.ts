export interface DesignComponentInput { sku_id: string }
export interface MaterialSnapshot { name: string; diameter_mm: number | null; image_file_id: string | null }
export interface DesignComponent extends DesignComponentInput { snapshot: MaterialSnapshot }
export interface DesignComponentDetail extends DesignComponent { current: MaterialSnapshot | null; changed: boolean; purchasable: boolean; unavailable_reason: string | null }
export interface SaveDesignPayload { design_id?: string | null; name: string; components: DesignComponentInput[] }
export interface SaveDesignResult { design_id: string; design_version_id: string; version_no: number; created_new_version: boolean }
export interface BuyerPagePayload { page_token: string | null; page_size: number }
export interface DesignSummary { design_id: string; name: string; current_version_no: number; current_design_version_id: string | null; thumbnail_file_id: string | null; updated_at: string }
export interface DesignPage { designs: DesignSummary[]; next_page_token: string | null; image_urls?: Record<string, string> }
export interface ListDesignVersionsPayload extends BuyerPagePayload { design_id: string }
export interface DesignVersionSummary { design_version_id: string; version_no: number; thumbnail_file_id: string | null; created_at: string }
export interface DesignVersionPage { design_id: string; current_version_no: number; versions: DesignVersionSummary[]; next_page_token: string | null; image_urls?: Record<string, string> }
export interface DesignVersionPayload { design_version_id: string }
export interface DesignVersionDetail { design_id: string; design_version_id: string; name: string; version_no: number; components: DesignComponentDetail[]; image_urls?: Record<string, string> }
export interface CopyDesignPayload extends DesignVersionPayload { name: string }
export interface CopyDesignResult { design_id: string; design_version_id: string; version_no: number }
