import { describe, expect, it } from 'vitest';
import { createRequestClient, SubmissionGate } from '../../packages/contracts/src/client.js';

describe('shared request boundary', () => {
  it('unwraps only the event function result and preserves business error/request ID', async () => {
    const call = createRequestClient(async () => ({ result: {ok:false,code:'FORBIDDEN',message:'无权限',data:null,request_id:'r-1'} }));
    await expect(call('getSiteConfig', { config_key:'points_rules' })).rejects.toMatchObject({code:'FORBIDDEN',requestId:'r-1'});
  });
  it('rejects a malformed response rather than treating it as empty success', async () => {
    const call=createRequestClient(async()=>({result:{data:[]}}));
    await expect(call('getPublicSiteConfig',{})).rejects.toThrow(/响应/);
  });
  it('allows no concurrent second submission and unlocks after rejection', async () => {
    const gate=new SubmissionGate(); let done!:()=>void; let count=0;
    const first=gate.run(async()=>{count++;await new Promise<void>(resolve=>{done=resolve});throw new Error('network');});
    await expect(gate.run(async()=>{count++;})).rejects.toThrow(/进行/);
    expect(count).toBe(1); done(); await expect(first).rejects.toThrow('network');
    await gate.run(async()=>{count++;}); expect(count).toBe(2);
  });
});
