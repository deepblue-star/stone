import { expect, it } from 'vitest';
import { tcbSql, ENV_ID } from '../../scripts/lib/tcb-sql';
import { readFileSync } from 'node:fs';
import { initialTableNames } from '../../scripts/lib/migration';

it('the live development database contains all twenty business tables with documented common fields', async()=>{
  const rows=await tcbSql<{table_name:string;column_name:string;column_comment:string}>(
    'SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,COLUMN_COMMENT AS column_comment FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  const names=initialTableNames(readFileSync('database/migrations/001_initial_schema.sql','utf8'));
  expect(names).toHaveLength(20);
  for(const name of names){
    for(const col of ['created_at','updated_at','is_deleted']) expect(rows.some(r=>r.table_name===name&&r.column_name===col&&r.column_comment.length>0)).toBe(true);
  }
  const db=await tcbSql<{name:string}>('SELECT DATABASE() AS name');
  expect(db[0]?.name).toBe(ENV_ID);
},30000);
