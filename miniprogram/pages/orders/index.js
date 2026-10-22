const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
const { money, time, orderStatus } = require('../../services/format')
Page({
  data: { filters: [{ status: '', name: '全部' }, { status: 'PENDING_PAYMENT', name: '待付款' }, { status: 'READY_TO_SHIP', name: '待发货' }, { status: 'SHIPPED', name: '已发货' }, { status: 'COMPLETED', name: '已完成' }, { status: 'CLOSED', name: '已关闭' }], status: '', items: [], next: null, loading: false, error: '' },
  onLoad(options) { if (this.data.filters.some(item => item.status === options.status)) this.setData({ status: options.status }) },
  onShow() { return this.load() },
  async load(append) {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try { const { data } = await request('listMyOrders', { status: this.data.status || null, page_token: append === true ? this.data.next : null, page_size: 20 }); const items = data.orders.map(item => ({ ...item, statusText: orderStatus[item.status] || item.status, amountText: money(item.total_amount_cent), timeText: time(item.created_at), deadlineText: time(item.payment_deadline_at) })); this.setData({ items: append === true ? this.data.items.concat(items) : items, next: data.next_page_token }) }
    catch (e) { this.setData({ error: e.message || '订单读取失败，请重试' }) }
    finally { this.setData({ loading: false }) }
  },
  filter(e) { if (this.data.loading) return; this.setData({ status: e.currentTarget.dataset.status, items: [], next: null }); return this.load() },
  more() { if (this.data.next) return this.load(true) },
  detail(e) { open(query('/pages/order/index', { order_no: e.currentTarget.dataset.id })) },
})
