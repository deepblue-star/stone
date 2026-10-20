import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createMysqlDatabase } from '../../packages/backend/src/db/mysql';
import { UnitOfWork } from '../../packages/backend/src/db/unit-of-work';
import { createDaos } from '../../packages/backend/src/dao';

/** Temporary, token-gated cloud verifier; never registered as a business action. */
export async function main(event:unknown) {
  const token=event && typeof event==='object' && 'token' in event ? event.token : undefined;
  const expected=process.env.STONE_VERIFY_TOKEN;
  if(typeof token!=='string'||!expected||token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))return {ok:false,code:'FORBIDDEN'};
  const db=createMysqlDatabase();const daos=createDaos(db);const work=new UnitOfWork(db,createDaos);
  const prefix=`foundation_test_${randomBytes(12).toString('hex')}`;
  const testOrderNo=`FT${randomBytes(12).toString('hex')}`;
  const accountIds:string[]=[];let step='database';
  const results:Record<string,boolean>={};
  const assert=(value:unknown)=>{if(!value)throw new Error('Verification assertion failed');};
  function dbCode(error:unknown){return error&&typeof error==='object'&&'code' in error ? String(error.code) : 'UNKNOWN';}
  async function newInvite(){for(let n=0;n<20;n++){const code=randomBytes(2).toString('hex').toUpperCase();if(!(await db.query('SELECT id FROM points_accounts WHERE invite_code=?',[code])).length)return code;}throw new Error('Fixture allocation failed');}
  try {
    const target=await db.query<{name:string}>('SELECT DATABASE() AS name');
    assert(target[0]?.name==='stone-d3gga4t2g2ffaedb6');
    step='commit';
    const commitInvite=await newInvite();
    const committed=await work.run(async transaction=>{
      const id=await transaction.pointsAccounts.insert({openid:`${prefix}_commit`,inviteCode:commitInvite});accountIds.push(id);
      await transaction.pointsAccounts.updateBalance({id,balance:'5',totalEarned:'5',totalSpent:'0'});
      await transaction.pointsLedger.insert({account_id:id,points_delta:'5',balance_after:'5',source_type:'DAILY_CHECK_IN',event_key:`${prefix}_commit`,source_ref:null,description:'foundation verifier fixture'});
      return id;
    });
    assert((await daos.pointsAccounts.findByOpenId(`${prefix}_commit`))?.balance==='5');
    assert((await daos.pointsLedger.findByEventKey(`${prefix}_commit`))?.account_id===committed);
    results.commit=true;
    step='rollback';
    const rollbackInvite=await newInvite();
    const injected=new Error('intentional verifier rollback');let rejected=false;
    try{await work.run(async transaction=>{
      const id=await transaction.pointsAccounts.insert({openid:`${prefix}_rollback`,inviteCode:rollbackInvite});accountIds.push(id);
      await transaction.pointsLedger.insert({account_id:id,points_delta:'5',balance_after:'5',source_type:'DAILY_CHECK_IN',event_key:`${prefix}_rollback`,source_ref:null,description:'foundation rollback fixture'});
      throw injected;
    });}catch(error){if(error!==injected)throw error;rejected=true;}
    assert(rejected);assert(await daos.pointsAccounts.findByOpenId(`${prefix}_rollback`)===null);assert(await daos.pointsLedger.findByEventKey(`${prefix}_rollback`)===null);
    results.rollback=true;
    step='reuse';assert(Number((await db.query<{ok:number|string}>('SELECT 1 AS ok'))[0]?.ok)===1);results.connectionReuse=true;
    step='cart_unique';let duplicate=false;
    // Both statements use the transaction executor, not the outer pool.
    const probe=new UnitOfWork(db,executor=>executor);
    try{await probe.run(async connection=>{
      await connection.execute('INSERT INTO cart_items(_openid,item_type,sku_id,quantity) VALUES(?,?,?,?)',[`${prefix}_cart`,'STANDARD','1',1]);
      await connection.execute('INSERT INTO cart_items(_openid,item_type,sku_id,quantity) VALUES(?,?,?,?)',[`${prefix}_cart`,'STANDARD','1',1]);
    });}catch(error){if(dbCode(error)!=='ER_DUP_ENTRY')throw error;duplicate=true;}
    assert(duplicate);assert(!(await db.query('SELECT id FROM cart_items WHERE _openid=?',[`${prefix}_cart`])).length);results.cartUnique=true;
    step='quantity_check';let check=false;
    try{await probe.run(async connection=>{await connection.execute('INSERT INTO cart_items(_openid,item_type,sku_id,quantity) VALUES(?,?,?,?)',[`${prefix}_invalid`,'STANDARD','1',0]);});}
    catch(error){if(dbCode(error)!=='ER_CHECK_CONSTRAINT_VIOLATED')throw error;check=true;}
    assert(check);results.quantityCheck=true;
    step='event_unique';let eventDuplicate=false;
    try{await probe.run(async connection=>{
      const values=[committed,'5','5','DAILY_CHECK_IN',`${prefix}_duplicate`,'foundation idempotency fixture'];
      const insert='INSERT INTO points_ledger(account_id,points_delta,balance_after,source_type,event_key,description) VALUES(?,?,?,?,?,?)';
      await connection.execute(insert,values);await connection.execute(insert,values);
    });}catch(error){if(dbCode(error)!=='ER_DUP_ENTRY')throw error;eventDuplicate=true;}
    assert(eventDuplicate);assert(await daos.pointsLedger.findByEventKey(`${prefix}_duplicate`)===null);results.eventUnique=true;
    step='money_check';let invalidMoney=false;
    try{await probe.run(async connection=>{
      await connection.execute("INSERT INTO orders(order_no,_openid,checkout_key,checkout_request_hash,quote_hash,payment_mode,goods_amount_cent,discount_amount_cent,shipping_fee_cent,total_amount_cent,address_snapshot,payment_deadline_at) VALUES(?,?,?,?,?,'WECHAT',100,0,0,99,JSON_OBJECT('fixture',true),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))",[testOrderNo,`${prefix}_money`,`${prefix}_money`,'0'.repeat(64),'1'.repeat(64)]);
    });}catch(error){if(dbCode(error)!=='ER_CHECK_CONSTRAINT_VIOLATED')throw error;invalidMoney=true;}
    assert(invalidMoney);results.moneyCheck=true;
    step='cleanup';
    await db.execute('DELETE FROM cart_items WHERE _openid IN (?,?)',[`${prefix}_cart`,`${prefix}_invalid`]);
    await db.execute('DELETE FROM orders WHERE order_no=? AND _openid=?',[testOrderNo,`${prefix}_money`]);
    for(const id of accountIds){await db.execute('DELETE FROM points_ledger WHERE account_id=? AND event_key LIKE ?',[id,`${prefix}%`]);await db.execute('DELETE FROM points_accounts WHERE id=? AND _openid LIKE ?',[id,`${prefix}%`]);}
    assert(!(await db.query('SELECT id FROM points_accounts WHERE _openid LIKE ?',[`${prefix}%`])).length);
    assert(!(await db.query('SELECT id FROM points_ledger WHERE event_key LIKE ?',[`${prefix}%`])).length);
    results.cleaned=true;
    return {ok:true,results};
  }catch(error){return {ok:false,step,sql_code:dbCode(error),results};}
  finally{
    // Also clean committed fixtures when a later assertion fails.
    await db.execute('DELETE FROM cart_items WHERE _openid IN (?,?)',[`${prefix}_cart`,`${prefix}_invalid`]);
    await db.execute('DELETE FROM orders WHERE order_no=? AND _openid=?',[testOrderNo,`${prefix}_money`]);
    for(const id of accountIds){await db.execute('DELETE FROM points_ledger WHERE account_id=? AND event_key LIKE ?',[id,`${prefix}%`]);await db.execute('DELETE FROM points_accounts WHERE id=? AND _openid LIKE ?',[id,`${prefix}%`]);}
    await db.end();
  }
}
