import { describe,expect,it } from 'vitest';
import { assertSignOutSucceeded } from '../../admin-web/src/auth-result';
describe('SDK sign-out response handling',()=>{
  it('reports a resolved SDK error rather than pretending sign-out succeeded',()=>{
    expect(()=>assertSignOutSucceeded({data:{},error:new Error('network')})).toThrow('退出未完成');
  });
  it('accepts successful responses and bridge APIs that return void',()=>{
    expect(()=>assertSignOutSucceeded({data:{},error:null})).not.toThrow();
    expect(()=>assertSignOutSucceeded(undefined)).not.toThrow();
  });
});
