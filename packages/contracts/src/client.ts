export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId?: string) {
    super(message); this.name = 'ApiError';
  }
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Both clients invoke an Event Function and unwrap res.result, never HTTP res.data. */
export function createRequestClient(invoke: (action: string, payload: object) => Promise<unknown>) {
  return async function request<T>(action: string, payload: object): Promise<{data:T;requestId:string}> {
    let raw: unknown;
    try { raw=await invoke(action,payload); }
    catch { throw new ApiError('NETWORK_ERROR','网络请求失败，请稍后重试'); }
    if(!record(raw) || !record(raw.result)) throw new ApiError('INVALID_RESPONSE','服务响应格式错误');
    const result=raw.result;
    if(typeof result.ok!=='boolean' || typeof result.code!=='string' || typeof result.message!=='string' || typeof result.request_id!=='string' || !('data' in result)) throw new ApiError('INVALID_RESPONSE','服务响应格式错误');
    if(!result.ok) throw new ApiError(result.code,result.message,result.request_id);
    if(result.code!=='OK') throw new ApiError('INVALID_RESPONSE','服务响应状态错误',result.request_id);
    return {data:result.data as T,requestId:result.request_id};
  };
}

/** Keep disabled state tied to the actual request, including network rejection. */
export class SubmissionGate {
  private pending = false;
  get submitting() { return this.pending; }
  async run<T>(operation:()=>Promise<T>):Promise<T> {
    if(this.pending) throw new ApiError('SUBMITTING','请求正在进行中');
    this.pending=true;
    try { return await operation(); } finally { this.pending=false; }
  }
}
