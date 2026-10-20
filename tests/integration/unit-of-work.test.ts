import { afterAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createMysqlDatabase } from '../../packages/backend/src/db/mysql';
import { UnitOfWork } from '../../packages/backend/src/db/unit-of-work';
import { createDaos } from '../../packages/backend/src/dao';

if(existsSync('.env'))process.loadEnvFile('.env');
const enabled=process.env.STONE_RUN_DB_TESTS==='1';
const db=createMysqlDatabase();
const prefix=`foundation_test_${randomUUID()}`;
const ids:string[]=[];
describe.skipIf(!enabled)('real MySQL multi-table transaction (requires reachable private network)',()=>{
  afterAll(async()=>{
    for(const id of ids){await db.execute('DELETE FROM points_ledger WHERE account_id=? AND event_key LIKE ?',[id,`${prefix}%`]);await db.execute('DELETE FROM points_accounts WHERE id=? AND _openid LIKE ?',[id,`${prefix}%`]);}
    await db.end();
  });
  it('commits account and ledger on the same connection',async()=>{
    const work=new UnitOfWork(db,createDaos);
    const id=await work.run(async daos=>{
      const id=await daos.pointsAccounts.insert({openid:`${prefix}_commit`,inviteCode:randomUUID().slice(0,4).toUpperCase()});ids.push(id);
      await daos.pointsAccounts.updateBalance({id,balance:'5',totalEarned:'5',totalSpent:'0'});
      await daos.pointsLedger.insert({account_id:id,points_delta:'5',balance_after:'5',source_type:'DAILY_CHECK_IN',event_key:`${prefix}_commit`,source_ref:null,description:'foundation integration fixture'});
      return id;
    });
    const account=await createDaos(db).pointsAccounts.findByOpenId(`${prefix}_commit`);
    const ledger=await createDaos(db).pointsLedger.findByEventKey(`${prefix}_commit`);
    expect(account?.id).toBe(id);expect(account?.balance).toBe('5');expect(ledger?.account_id).toBe(id);
  },30000);
  it('rolls back both rows and can subsequently reuse the pool',async()=>{
    const work=new UnitOfWork(db,createDaos);
    await expect(work.run(async daos=>{
      const id=await daos.pointsAccounts.insert({openid:`${prefix}_rollback`,inviteCode:randomUUID().slice(0,4).toUpperCase()});ids.push(id);
      await daos.pointsLedger.insert({account_id:id,points_delta:'5',balance_after:'5',source_type:'DAILY_CHECK_IN',event_key:`${prefix}_rollback`,source_ref:null,description:'foundation rollback fixture'});
      throw new Error('injected rollback');
    })).rejects.toThrow('injected rollback');
    expect(await createDaos(db).pointsAccounts.findByOpenId(`${prefix}_rollback`)).toBeNull();
    expect(await createDaos(db).pointsLedger.findByEventKey(`${prefix}_rollback`)).toBeNull();
    expect(Number((await db.query<{ok:number|string}>('SELECT 1 AS ok'))[0]?.ok)).toBe(1);
  },30000);
});
