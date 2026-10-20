import { readFile } from 'node:fs/promises';
import { splitStatements } from './lib/migration';
import { tcbSql, ENV_ID } from './lib/tcb-sql';
const current=(await tcbSql<{name:string}>('SELECT DATABASE() AS name'))[0];
if(current?.name!==ENV_ID)throw new Error('Unexpected development database');
for(const statement of splitStatements(await readFile('database/seeds/empty-public-config.sql','utf8')))await tcbSql(statement,false);
console.log('Development public config initialized without overwriting existing values');
