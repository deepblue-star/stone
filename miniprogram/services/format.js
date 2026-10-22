function money(value) {
  if (value === null || value === undefined) return '—'
  let digits = String(value)
  if (!/^\d+$/.test(digits)) return '—'
  digits = digits.replace(/^0+(?=\d)/, '').padStart(3, '0')
  return digits.slice(0, -2) + '.' + digits.slice(-2)
}
function time(value) {
  if (!value) return '—'
  const date = new Date(new Date(value).getTime() + 8 * 3600000)
  if (!Number.isFinite(date.getTime())) return '—'
  const pad = number => String(number).padStart(2, '0')
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()) + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds())
}
const orderStatus = { PENDING_PAYMENT: '待付款', READY_TO_SHIP: '待发货', SHIPPED: '已发货', COMPLETED: '已完成', CLOSED: '已关闭' }
function signedPoints(value) {
  if (value === null || value === undefined) return '—'
  const text = String(value)
  if (!/^[+-]?\d+$/.test(text)) return '—'
  return /^[+-]/.test(text) ? text : '+' + text
}
module.exports = { money, time, orderStatus, signedPoints }
