/** Browser SDK may resolve an error instead of rejecting, despite its signOut typing. */
export function assertSignOutSucceeded(result:unknown):void {
  if(result && typeof result==='object' && 'error' in result && result.error)throw new Error('退出未完成，请重试');
}
