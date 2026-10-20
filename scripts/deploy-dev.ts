import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, delimiter, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mysqlPoolOptions } from '../packages/backend/src/db/mysql';

if(existsSync('.env'))process.loadEnvFile('.env');
mysqlPoolOptions(); // Fail before any deploy if a credential or connection setting is absent.
const run=promisify(execFile);
const config=JSON.parse(await readFile('cloudbaserc.json','utf8')) as {
  envId:string;functionRoot:string;functions:{name:string;envVariables:Record<string,string>}[]
};
if(config.envId!=='stone-d3gga4t2g2ffaedb6')throw new Error('Unexpected target environment');
// CLI 3.8 resolves functionRoot against cwd even for an external config file.
config.functionRoot='cloudfunctions';
const business=config.functions.find(fn=>fn.name==='business-api');
if(!business)throw new Error('Missing business-api deployment definition');
for(const key of ['MYSQL_HOST','MYSQL_PORT','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD','MYSQL_CONNECTION_LIMIT','MYSQL_SSL']){
  const value=process.env[key];if(value!==undefined)business.envVariables[key]=value;
}
await mkdir('.local',{recursive:true});
const configPath=resolve('.local/cloudbaserc.dev.json');
await writeFile(configPath,JSON.stringify(config),{mode:0o600});
try{
  const args=['fn','deploy','business-api','--env-id',config.envId,'--config-file',configPath];
  let command='tcb';let argv=args;
  if(process.platform==='win32'){
    const wrapper=(process.env.PATH??'').split(delimiter).map(p=>join(p,'tcb.ps1')).find(p=>existsSync(p));
    if(!wrapper)throw new Error('CloudBase CLI is missing from PATH');
    const entry=join(dirname(wrapper),'node_modules','@cloudbase','cli','bin','tcb');
    if(!existsSync(entry))throw new Error('CloudBase CLI entry not found');
    command=process.execPath;argv=[entry,...args];
  }
  const {stdout}=await run(command,argv,{timeout:300000,maxBuffer:4*1024*1024,windowsHide:true});
  // A deploy error must not spill a credential-containing config or subprocess argv.
  let safe=stdout;
  for(const key of ['MYSQL_PASSWORD']){const value=process.env[key];if(value)safe=safe.replaceAll(value,'[REDACTED]');}
  console.log(safe);
}catch(error){
  let detail=error && typeof error==='object' ? ['stdout','stderr'].map(key=>(key in error && typeof (error as Record<string,unknown>)[key]==='string')?(error as Record<string,string>)[key]:'').join('\n') : '';
  const password=process.env.MYSQL_PASSWORD;
  if(password)detail=detail.replaceAll(password,'[REDACTED]').replaceAll(JSON.stringify(password).slice(1,-1),'[REDACTED]');
  if(detail.trim())console.error(detail.slice(-12000));
  throw new Error('Development deployment failed; credentials were redacted. Inspect CloudBase function status.');
}
finally{await unlink(configPath);}
