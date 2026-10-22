import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { ApiError } from '../../packages/contracts/src/client';
function fixture(configured = true, httpCode = 200, cancel = false) {
  const module = { exports: {} };
  let reads = 0;
  const request = vi.fn(async (_action: string, _payload: object) => ({ data: { status: ++reads === 1 ? 'PENDING_PAYMENT' : 'READY_TO_SHIP', can_pay: true } }));
  const http = vi.fn((options: { path: string; success: (result: unknown) => void }) => options.success({ statusCode: httpCode, data: httpCode === 202 ? { ok: false, code: 'PAYMENT_CONFIRMING', data: { order_no: 'O1' } } : { ok: true, code: 'OK', data: { timeStamp: '123', nonceStr: 'nonce', package: 'prepay_id=test', signType: 'RSA', paySign: 'signed' } } }));
  const pay = vi.fn((options: { success: () => void; fail: (result: unknown) => void }) => cancel ? options.fail({ errMsg: 'requestPayment:fail cancel' }) : options.success());
  runInNewContext(readFileSync('miniprogram/services/payment.js', 'utf8'), { module, require(path: string) { if (path === './api') return { request }; if (path === './client') return { ApiError }; if (path === '../config') return { envId: 'dev-env', paymentFunctionName: configured ? 'generated-pay-test' : '' }; throw new Error(path); }, wx: { cloud: { callHTTPFunction: http }, requestPayment: pay } });
  return { client: module.exports as { requestOrderPayment(orderNo: string): Promise<{ state: string }> }, request, http, pay };
}
it('fails closed without a configured payment integration and preserves original order', async () => {
  const f = fixture(false); await expect(f.client.requestOrderPayment('O1')).rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED' });
  expect(f.http).not.toHaveBeenCalled(); expect(f.pay).not.toHaveBeenCalled();
});
it('never trusts frontend success; queries and checks business order before reporting paid', async () => {
  const f = fixture(); expect(await f.client.requestOrderPayment('O1')).toEqual({ state: 'PAID' });
  expect(f.http).toHaveBeenCalledTimes(2); expect(f.request).toHaveBeenCalledTimes(2);
  expect(f.http.mock.calls[0]?.[0]).toMatchObject({ data: { order_no: 'O1' }, path: '/wx-pay/wxpay_order' });
  expect(f.http.mock.calls[0]?.[0]).not.toHaveProperty('data.amount');
});
it('keeps unknown results confirming and does not open cashier without payment parameters', async () => {
  const f = fixture(true, 202); expect(await f.client.requestOrderPayment('O1')).toEqual({ state: 'CONFIRMING' }); expect(f.pay).not.toHaveBeenCalled();
});
it('keeps a cancelled payment pending instead of creating or paying a new order', async () => {
  const f = fixture(true, 200, true); expect(await f.client.requestOrderPayment('O1')).toEqual({ state: 'PENDING' });
  expect(f.request.mock.calls.every(call => call[0] === 'getMyOrderDetail')).toBe(true);
});
