const { request } = require('./api')
const { ApiError } = require('./client')
const { envId, paymentFunctionName } = require('../config')
let pending = false
function state(order) {
  if (['READY_TO_SHIP', 'SHIPPED', 'COMPLETED'].includes(order.status)) return 'PAID'
  if (order.status === 'CLOSED') return 'CLOSED'
  return 'PENDING'
}
function http(path, orderNo) {
  return new Promise((resolve, reject) => wx.cloud.callHTTPFunction({ name: paymentFunctionName, config: { env: envId }, method: 'POST', header: { 'Content-Type': 'application/json' }, path: '/wx-pay/' + path, data: { order_no: orderNo }, success: resolve, fail: reject }))
}
function body(response) {
  let data = response.data
  if (typeof data === 'string') { try { data = JSON.parse(data) } catch { throw new ApiError('INVALID_RESPONSE', '支付响应异常，订单已保留') } }
  if (!data || typeof data !== 'object') throw new ApiError('INVALID_RESPONSE', '支付响应异常，订单已保留')
  if (response.statusCode === 202 || data.code === 'PAYMENT_CONFIRMING') return null
  if (response.statusCode !== 200 || data.ok !== true || data.code !== 'OK') throw new ApiError(typeof data.code === 'string' ? data.code : 'PAYMENT_UNAVAILABLE', data.message || '暂时无法支付，订单已保留', data.request_id)
  return data.data
}
async function requestOrderPayment(orderNo) {
  if (pending) throw new ApiError('SUBMITTING', '正在处理支付，请勿重复操作')
  pending = true
  try {
    const { data: order } = await request('getMyOrderDetail', { order_no: orderNo })
    const current = state(order)
    if (current !== 'PENDING') return { state: current }
    if (!order.can_pay) throw new ApiError('PAYMENT_EXPIRED', '订单已过支付截止时间，正在确认关闭')
    if (!paymentFunctionName) throw new ApiError('PAYMENT_NOT_CONFIGURED', '开发环境尚未配置微信支付，订单已保留；可稍后在原订单继续支付')
    if (!wx.cloud || typeof wx.cloud.callHTTPFunction !== 'function') throw new ApiError('PAYMENT_UNSUPPORTED', '微信基础库需升级至 3.15.2 或更高版本')
    let response
    try { response = await http('wxpay_order', orderNo) }
    catch { return { state: 'CONFIRMING' } }
    const data = body(response)
    if (!data) return { state: 'CONFIRMING' }
    const parameters = data.payment_params || data
    for (const key of ['timeStamp', 'nonceStr', 'package', 'paySign']) if (typeof parameters[key] !== 'string' || !parameters[key]) throw new ApiError('INVALID_RESPONSE', '未取得有效支付参数，订单已保留')
    let cancelled = false
    await new Promise(resolve => wx.requestPayment({ timeStamp: parameters.timeStamp, nonceStr: parameters.nonceStr, package: parameters.package, signType: parameters.signType || 'RSA', paySign: parameters.paySign, success: resolve, fail: error => { cancelled = Boolean(error && typeof error.errMsg === 'string' && error.errMsg.includes('cancel')); resolve() } }))
    if (cancelled) return { state: 'PENDING' }
    try {
      const queried = await http('wxpay_query_order_by_out_trade_no', orderNo)
      if (!body(queried)) return { state: 'CONFIRMING' }
      const { data: updated } = await request('getMyOrderDetail', { order_no: orderNo })
      return { state: state(updated) }
    } catch { return { state: 'CONFIRMING' } }
  } finally { pending = false }
}
module.exports = { requestOrderPayment }
