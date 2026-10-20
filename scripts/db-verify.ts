import { readFile } from 'node:fs/promises';
import { tcbSql, ENV_ID } from './lib/tcb-sql.js';
import { splitStatements, initialTableNames } from './lib/migration.js';

const sql = await readFile('database/migrations/001_initial_schema.sql', 'utf8');
const columns = await tcbSql<{ table_name:string; column_name:string; data_type:string; column_type:string; is_nullable:string; column_comment:string; column_key:string; extra:string }>(
  'SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,DATA_TYPE AS data_type,COLUMN_TYPE AS column_type,IS_NULLABLE AS is_nullable,COLUMN_COMMENT AS column_comment,COLUMN_KEY AS column_key,EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
const indexes = await tcbSql<{ table_name:string; index_name:string; non_unique:number; seq_in_index:number; column_name:string }>(
  'SELECT TABLE_NAME AS table_name,INDEX_NAME AS index_name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS seq_in_index,COLUMN_NAME AS column_name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()');
const constraints = await tcbSql<{ table_name:string; constraint_name:string; constraint_type:string }>(
  'SELECT TABLE_NAME AS table_name,CONSTRAINT_NAME AS constraint_name,CONSTRAINT_TYPE AS constraint_type FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE()');
const errors:string[] = [];
for(const statement of splitStatements(sql)) {
  const name=initialTableNames(statement)[0]!;
  const actual=columns.filter(c=>c.table_name===name);
  const expectedCols=[...statement.matchAll(/^  ([a-z_]+)\s+([A-Z]+)([^\n]*)/gm)];
  if(actual.length!==expectedCols.length) errors.push(`${name}: column count mismatch`);
  for(const col of expectedCols){const actualCol=actual.find(c=>c.column_name===col[1]);
    if(!actualCol) errors.push(`${name}.${col[1]} missing`);
    else {
      if(!actualCol.column_comment) errors.push(`${name}.${col[1]} missing comment`);
      if(actualCol.data_type!==col[2]!.toLowerCase()) errors.push(`${name}.${col[1]} type mismatch`);
      if(/\bUNSIGNED\b/.test(col[3]!)&&!actualCol.column_type.includes('unsigned')) errors.push(`${name}.${col[1]} unsigned missing`);
      if(/\bNOT NULL\b/.test(col[3]!)&&actualCol.is_nullable!=='NO') errors.push(`${name}.${col[1]} nullability mismatch`);
      if(/\bAUTO_INCREMENT\b/.test(col[3]!)&&!actualCol.extra.includes('auto_increment')) errors.push(`${name}.${col[1]} auto increment missing`);
    }
  }
  for(const field of ['created_at','updated_at']) if(actual.find(c=>c.column_name===field)?.data_type!=='datetime') errors.push(`${name}.${field} must be DATETIME`);
  if(!actual.some(c=>c.column_name==='is_deleted')) errors.push(`${name}.is_deleted missing`);
  if(!actual.some(c=>c.column_key==='PRI')) errors.push(`${name}: primary key missing`);
  for(const match of statement.matchAll(/\b(UNIQUE )?KEY ([a-z_]+)\s*\(([^)]+)\)/g)) {
    const found=indexes.filter(i=>i.table_name===name && i.index_name===match[2]).sort((a,b)=>Number(a.seq_in_index)-Number(b.seq_in_index));
    const expected=match[3]!.split(',').map(c=>c.trim());
    if(found.map(i=>i.column_name).join(',')!==expected.join(',')) errors.push(`${name}.${match[2]} columns mismatch`);
    if(found.length && Number(found[0]!.non_unique)!==(match[1]?0:1)) errors.push(`${name}.${match[2]} uniqueness mismatch`);
  }
  for(const match of statement.matchAll(/\bCONSTRAINT ([a-z_]+) CHECK/g)) if(!constraints.some(c=>c.table_name===name && c.constraint_name===match[1] && c.constraint_type==='CHECK')) errors.push(`${name}.${match[1]} missing`);
  console.log(`CHECKED ${name}: ${actual.length} columns`);
}
if(errors.length) throw new Error(errors.join('\n'));
console.log(`VERIFIED ${initialTableNames(sql).length} business tables in ${ENV_ID}; source revision 844`);
