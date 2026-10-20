import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tcbSql, ENV_ID } from './lib/tcb-sql.js';
import { splitStatements, initialTableNames } from './lib/migration.js';

const files = (await readdir('database/migrations')).filter(f => /^\d+_[a-z_]+\.sql$/.test(f)).sort();
const target = (await tcbSql<{ database_name: string }>('SELECT DATABASE() AS database_name'))[0];
if (target?.database_name !== ENV_ID) throw new Error('Database identity mismatch; refusing migration');
const tableRows = await tcbSql<{ table_name: string }>('SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
const tables = new Set(tableRows.map(row => row.table_name));
const metadata = '_schema_migrations';
if (!tables.has(metadata)) {
  if (tables.size) throw new Error('Unmanaged tables exist; compare schema before taking ownership');
  await tcbSql(`CREATE TABLE ${metadata} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '迁移记录自增主键',
    version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'SQL文件版本；永久唯一',
    checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '已执行SQL文件SHA-256摘要',
    status ENUM('APPLYING','APPLIED') NOT NULL COMMENT 'MySQL DDL不可跨表回滚；中断时保留APPLYING供人工核对',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；UTC秒级',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间；UTC秒级',
    is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记；迁移历史不删除',
    PRIMARY KEY(id), UNIQUE KEY uk_migration_version(version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据库结构变更版本记录；非业务表'`, false);
}
for (const file of files) {
  const sql = await readFile(`database/migrations/${file}`, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const history = await tcbSql<{ checksum: string; status: string }>(`SELECT checksum,status FROM ${metadata} WHERE version='${file}'`);
  if (history[0]) {
    if (history[0].checksum !== checksum) throw new Error(`Applied migration content changed: ${file}`);
    if (history[0].status !== 'APPLIED') throw new Error(`Interrupted migration requires schema inspection: ${file}`);
    console.log(`SKIP ${file}`); continue;
  }
  const expected = initialTableNames(sql);
  if (expected.some(name => tables.has(name))) throw new Error('Target table exists without matching migration history');
  await tcbSql(`INSERT INTO ${metadata}(version,checksum,status,created_at,updated_at) VALUES('${file}','${checksum}','APPLYING',UTC_TIMESTAMP(),UTC_TIMESTAMP())`, false);
  for (const statement of splitStatements(sql)) {
    const name = /^CREATE TABLE\s+([a-z_]+)/.exec(statement)?.[1];
    await tcbSql(statement, false);
    console.log(`CREATED ${name}`);
  }
  const actual = await tcbSql<{ table_name: string }>('SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  if (!expected.every(name => actual.some(row => row.table_name === name))) throw new Error('Created table verification failed');
  await tcbSql(`UPDATE ${metadata} SET status='APPLIED',updated_at=UTC_TIMESTAMP() WHERE version='${file}' AND checksum='${checksum}' AND status='APPLYING'`, false);
  console.log(`APPLIED ${file}: ${expected.length} business tables`);
}
