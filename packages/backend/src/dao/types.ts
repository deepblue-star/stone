/** Database values are UTC timestamps. BIGINT values are always strings. JSON stays unknown. */
export type Timestamp = Date | string;
export interface RowMetadata {
  created_at: Timestamp;
  updated_at: Timestamp;
  is_deleted: number;
}
