const { request } = require('../../services/api')
const { money, time, orderStatus } = require('../../services/format')
const { open } = require('../../services/navigation')
const { requestOrderPayment } = require('../../services/payment')
Page({
  data: { order: null, items: [], loading: false, submitting: false, canPay: false, remaining: '', statusText: '', error: '', paymentNote: '', goodsText: '', discountText: '', shippingText: '', totalText: '', deadlineText: '', createdText: '', paidText: '', completedText: '', shippedText: '' },
  onLoad(options) { this.orderNo = options.order_no; if (options.payment_note) this.setData({ paymentNote: options.payment_note }) },
  onShow() { return this.load() },
  onHide() { if (this.timer) clearInterval(this.timer) },
  onUnload() { if (this.timer) clearInterval(this.timer) },
  async load() {
    if (this.data.loading) return
    if (!this.orderNo) { this.setData({ error: '订单链接不完整' }); return }
    this.setData({ loading: true, error: '' })
    try {
      const { data } = await request('getMyOrderDetail', { order_no: this.orderNo })
      const items = data.items.map((item, index) => { const snapshot = item.item_snapshot || {}; return { ...item, index, name: snapshot.name || '成交商品', specText: snapshot.spec_text || '', version: snapshot.version_no || '', imageUrl: (data.image_urls || {})[snapshot.image_file_id || snapshot.thumbnail_file_id] || '', amountText: money(item.line_amount_cent), discountText: money(item.discount_amount_cent) } })
      this.setData({ order: data, items, statusText: orderStatus[data.status] || data.status, goodsText: money(data.goods_amount_cent), discountText: money(data.discount_amount_cent), shippingText: money(data.shipping_fee_cent), totalText: money(data.total_amount_cent), deadlineText: time(data.payment_deadline_at), createdText: time(data.created_at), paidText: time(data.paid_at), completedText: time(data.completed_at), shippedText: time(data.shipping && data.shipping.shipped_at) })
      this.tick(); if (this.timer) clearInterval(this.timer); if (data.status === 'PENDING_PAYMENT' && data.can_pay) this.timer = setInterval(() => this.tick(), 1000)
    } catch (e) { this.setData({ error: e.message || '订单读取失败，请重试', canPay: false }) }
    finally { this.setData({ loading: false }) }
  },
  tick() { const order = this.data.order; if (!order) return; const seconds = Math.max(0, Math.ceil((new Date(order.payment_deadline_at).getTime() - Date.now()) / 1000)); this.setData({ canPay: order.status === 'PENDING_PAYMENT' && order.can_pay && seconds > 0, remaining: seconds > 0 ? Math.floor(seconds / 60) + '分' + seconds % 60 + '秒' : '付款时间已到，等待服务端确认状态' }); if (!seconds && this.timer) clearInterval(this.timer) },
  async pay() {
    this.tick()
    if (this.data.submitting || !this.data.canPay) return
    this.setData({ submitting: true, error: '', paymentNote: '正在连接微信支付，请勿重复操作' })
    try { const result = await requestOrderPayment(this.orderNo); this.setData({ paymentNote: result.state === 'CONFIRMING' ? '支付结果确认中，请刷新订单状态' : result.state === 'PENDING' ? '尚未完成付款，可在截止时间前继续支付' : '' }); await this.load() }
    catch (e) { this.setData({ error: e.message || '暂未调起微信支付，请稍后继续支付', paymentNote: '订单已保留，可通过原订单继续支付' }) }
    finally { this.setData({ submitting: false }) }
  },
  copyOrder() { if (this.data.order) wx.setClipboardData({ data: this.data.order.order_no }) },
  copyTracking() { if (this.data.order && this.data.order.shipping) wx.setClipboardData({ data: this.data.order.shipping.tracking_no }) },
  contact() { open('/pages/contact/index') },
})
