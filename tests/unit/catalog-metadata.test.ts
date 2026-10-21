import {expect,it,vi} from'vitest';
import {CatalogNodeStorage,metadataFromHeaders} from '../../packages/backend/src/catalog/node-storage';
it('uses the complete object size rather than the single returned byte',()=>{
 expect(metadataFromHeaders(206,{'content-type':'image/png','content-length':'1','content-range':'bytes 0-0/2272819'})).toEqual({status:206,mime:'image/png',size:2272819});
 expect(metadataFromHeaders(206,{'content-type':'image/png','content-length':'1'}).size).toBe(0);
});
it('accepts authenticated partial-content metadata but not a missing total size',async()=>{
 const fileID='cloud://env.bucket/catalog/a.png';const sdk={getTempFileURL:async()=>({fileList:[{fileID,code:'SUCCESS',tempFileURL:'https://bucket.myqcloud.com/a.png'}]})};
 expect((await new CatalogNodeStorage(()=>sdk,async()=>({status:206,mime:'image/png',size:123})).getFileInfo({fileList:[{fileID,maxAge:60}]})).fileList).toMatchObject([{code:'SUCCESS',size:123}]);
});
it('checks metadata through the HTTPS adapter while retaining SDK-generated URLs',async()=>{
 const fileID='cloud://env.bucket/catalog/a.png';
 const sdk={getTempFileURL:vi.fn(async()=>({fileList:[{fileID,code:'SUCCESS',tempFileURL:'https://bucket.cos.ap-shanghai.myqcloud.com/catalog/a.png?sign=private'}]}))};
 const head=vi.fn(async()=>({status:200,mime:'image/png',size:123}));
 const adapter=new CatalogNodeStorage(()=>sdk,head);
 expect((await adapter.getFileInfo({fileList:[{fileID,maxAge:60}]})).fileList).toMatchObject([{fileID,code:'SUCCESS',mime:'image/png',size:123}]);
 expect(head).toHaveBeenCalledWith('https://bucket.cos.ap-shanghai.myqcloud.com/catalog/a.png?sign=private');
});
it('does not treat a forbidden response as valid image metadata',async()=>{
 const fileID='cloud://env.bucket/catalog/a.png';
 const adapter=new CatalogNodeStorage(()=>({getTempFileURL:async()=>({fileList:[{fileID,code:'SUCCESS',tempFileURL:'https://bucket.myqcloud.com/a.png'}]})}),async()=>({status:403,mime:'application/xml',size:200}));
 expect((await adapter.getFileInfo({fileList:[{fileID,maxAge:60}]})).fileList).toMatchObject([{code:'HTTP_403'}]);
});
it('rejects non-vendor or non-HTTPS URLs before opening a connection',async()=>{
 const head=vi.fn(async()=>({status:200,mime:'image/png',size:123}));
 const adapter=new CatalogNodeStorage(()=>({getTempFileURL:async()=>({fileList:[{fileID:'x',code:'SUCCESS',tempFileURL:'http://127.0.0.1/private'}]})}),head);
 expect((await adapter.getFileInfo({fileList:[{fileID:'x',maxAge:60}]})).fileList).toMatchObject([{code:'INVALID_STORAGE_URL'}]);expect(head).not.toHaveBeenCalled();
});
