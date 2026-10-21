import {request} from 'node:https';
import type {IncomingHttpHeaders} from 'node:http';
import type {CatalogStorageClient} from './storage';
type Signer=Pick<CatalogStorageClient,'getTempFileURL'>;
interface Metadata {status:number;mime:string;size:number}
function allowedUrl(value:string):boolean {
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname.endsWith('.myqcloud.com')||url.hostname.endsWith('.tcb.qcloud.la')||url.hostname.endsWith('.tcloudbase.com')||url.hostname.endsWith('.tcloudbaseapp.com'));}catch{return false;}
}
/** Uses the SDK-signed URL unchanged. This is our transport adapter, not a new CloudBase API. */
export function metadataFromHeaders(status:number,headers:IncomingHttpHeaders):Metadata {
 const mime=String(headers['content-type']??'').split(';')[0]!.trim();
 const range=String(headers['content-range']??'').match(/^bytes 0-0\/(\d+)$/);
 const size=Number(status===206?(range?.[1]??0):(headers['content-length']??0));
 return {status,mime,size:Number.isSafeInteger(size)?size:0};
}
export function readStorageImageMetadata(url:string):Promise<Metadata>{
 return new Promise((resolve,reject)=>{
  // Download URLs may be signed specifically for GET, so HEAD can be forbidden.
  // Read only one byte, derive the full size from Content-Range, then close.
  const req=request(url,{method:'GET',headers:{Range:'bytes=0-0'},timeout:8000},res=>{
   resolve(metadataFromHeaders(res.statusCode??0,res.headers));res.destroy();
  });
  req.on('timeout',()=>req.destroy(new Error('METADATA_TIMEOUT')));
  req.on('error',()=>reject(new Error('METADATA_UNAVAILABLE')));req.end();
 });
}
export class CatalogNodeStorage implements CatalogStorageClient {
 constructor(private readonly sdk:()=>Signer,private readonly read:(url:string)=>Promise<Metadata>=readStorageImageMetadata){}
 getTempFileURL(input:Parameters<Signer['getTempFileURL']>[0]){return this.sdk().getTempFileURL(input);}
 async getFileInfo(input:Parameters<CatalogStorageClient['getFileInfo']>[0]){
  const signed=await this.sdk().getTempFileURL(input);
  const fileList=await Promise.all((signed.fileList??[]).map(async file=>{
   if(file.code!=='SUCCESS'||!file.tempFileURL)return file;
   if(!allowedUrl(file.tempFileURL))return {...file,code:'INVALID_STORAGE_URL'};
   try{const metadata=await this.read(file.tempFileURL);return {...file,code:metadata.status===200||metadata.status===206?'SUCCESS':`HTTP_${metadata.status}`,mime:metadata.mime,size:metadata.size};}
   catch{return {...file,code:'METADATA_UNAVAILABLE'};}
  }));return {fileList};
 }
}
