export type SqlParameter = string | number | boolean | Date | null;
export interface MutationResult { affectedRows: number; insertId: string }

/** Shared by pool reads and a single transactional connection. SQL must be parameterized. */
export interface DatabaseExecutor {
  query<Row>(sql: string, params?: readonly SqlParameter[]): Promise<readonly Row[]>;
  execute(sql: string, params?: readonly SqlParameter[]): Promise<MutationResult>;
}
export interface DatabaseConnection extends DatabaseExecutor {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
  /** Remove an unsafe session from the pool and close it; do not release it. */
  destroy(): Promise<void>;
}
export interface DatabasePool { getConnection(): Promise<DatabaseConnection> }
