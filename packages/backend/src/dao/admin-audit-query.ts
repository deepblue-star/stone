import type { SqlParameter } from '../db/database';
export interface AdminAuditTimeFilter { createdFrom?: string; createdTo?: string }
export interface AdminAuditCursor { createdAt: string; id: string }
/** Aliases are constants from table DAOs; all caller values remain parameters. */
export function auditTimeConditions(alias: 'l' | 'r' | 'q', filter: AdminAuditTimeFilter, before: AdminAuditCursor | undefined, params: SqlParameter[]): string {
  let where = '';
  if (filter.createdFrom !== undefined) { where += ` AND ${alias}.created_at >= ?`; params.push(filter.createdFrom); }
  if (filter.createdTo !== undefined) { where += ` AND ${alias}.created_at <= ?`; params.push(filter.createdTo); }
  if (before) { where += ` AND (${alias}.created_at < ? OR (${alias}.created_at = ? AND ${alias}.id < ?))`; params.push(before.createdAt, before.createdAt, before.id); }
  return where;
}
