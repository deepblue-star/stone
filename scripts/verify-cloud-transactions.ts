import { build } from 'esbuild';
import { randomBytes } from 'node:crypto';
import { mkdir,writeFile,readFile,unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { delimiter,dirname,join,resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mysqlPoolOptions } from '../packages/backend/src/db/mysql';

if(existsSync('.env'))process.loadEnvFile('.env');mysqlPoolOptions();
const run=promisify(execFile);const token=randomBytes(32).toString('hex');const name='foundation-db-check';
const root='.local/cloudfunctions';await mkdir(`${root}/${name}`,{recursive:true});
await build({entryPoints:['tests/cloud/transaction-check.ts'],outfile:`${root}/${name}/index.js`,bundle:true,platform:'node',format:'cjs',target:'node18',packages:'external'});
await writeFile(`${root}/${name}/package.json`,JSON.stringify({name,version:'0.1.0',private:true,main:'index.js',dependencies:{mysql2:'3.24.6'}}));
const base=JSON.parse(await readFile('cloudbaserc.json','utf8')) as {envId:string;functions:Record<string,unknown>[]};
const variables:Record<string,string>={STONE_VERIFY_TOKEN:token,STONE_ENV_ID:base.envId};
for(const key of ['MYSQL_HOST','MYSQL_PORT','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD','MYSQL_CONNECTION_LIMIT','MYSQL_SSL'])if(process.env[key])variables[key]=process.env[key]!;
const configPath=resolve('.local/cloudbaserc.verify.json');const requestPath=resolve('.local/verify-request.json');
await writeFile(configPath,JSON.stringify({envId:base.envId,functionRoot:root,functions:[{...base.functions[0],name,timeout:60,envVariables:variables}]}),{mode:0o600});
await writeFile(requestPath,JSON.stringify({token}),{mode:0o600});
const args=(parts:string[])=>process.platform==='win32'?(()=>{
  const wrapper=(process.env.PATH??'').split(delimiter).map(p=>join(p,'tcb.ps1')).find(p=>existsSync(p));if(!wrapper)throw new Error('CLI missing');
  return {command:process.execPath,argv:[join(dirname(wrapper),'node_modules/@cloudbase/cli/bin/tcb'),...parts]};
})():{command:'tcb',argv:parts};
try{
  const deploy=args(['fn','deploy',name,'--force','--env-id',base.envId,'--config-file',configPath]);
  await run(deploy.command,deploy.argv,{timeout:300000,maxBuffer:4*1024*1024,windowsHide:true});
  const invoke=args(['fn','invoke',name,'--env-id',base.envId,'--data',`@${requestPath}`,'--json']);
  const result=await run(invoke.command,invoke.argv,{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});
  const envelope:unknown=JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  if(!envelope || typeof envelope!=='object' || !('data' in envelope) || !envelope.data || typeof envelope.data!=='object')throw new Error('Invalid invocation response');
  const data=envelope.data;
  if(!('RetMsg' in data) || typeof data.RetMsg!=='string')throw new Error('Missing verifier result');
  const payload:unknown=JSON.parse(data.RetMsg);
  if(!payload || typeof payload!=='object')throw new Error('Invalid verifier result');
  // Only allowlisted verification metadata leaves this script, never the invocation body/logs.
  console.log(JSON.stringify({requestId:'RequestId' in data?data.RequestId:undefined,result:payload},null,2));
  if(!('ok' in payload) || payload.ok!==true || !('results' in payload) || !payload.results || typeof payload.results!=='object')throw new Error('Verification failed');
  const checks=payload.results;
  for(const key of ['commit','rollback','connectionReuse','cartUnique','quantityCheck','eventUnique','moneyCheck','cleaned'])if(!(key in checks) || (checks as Record<string,unknown>)[key]!==true)throw new Error('Verification check did not pass');
}catch{throw new Error('Cloud transaction verification could not complete; inspect private verifier status/logs.');}
finally{await unlink(configPath);await unlink(requestPath);}
