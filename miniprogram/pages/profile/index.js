const { request } = require('../../services/api')
const { open } = require('../../services/navigation')
Page({
  data: { loading: false, error: '', summary: null, menus: [{ title: '优惠券', detail: '查看免费珠子券', path: '/pages/coupons/index' }, { title: '积分与兑换', detail: '签到、积分明细与积分商城', path: '/pages/points/index' }, { title: '购物车', detail: '查看待结算商品和设计', path: '/pages/cart/index' }, { title: '我的订单', detail: '查看订单与物流', path: '/pages/orders/index' }, { title: '收货地址', detail: '管理收货信息', path: '/pages/addresses/index' }, { title: '客服', detail: '查看客服微信', path: '/pages/contact/index' }] },
  onShow() { this.load(); if (!this.data.menus.some(item => item.path === '/pages/terms/index')) this.setData({ menus: this.data.menus.concat({ title: '条款和条件', detail: '查看使用说明', path: '/pages/terms/index' }) }) },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try { const { data } = await request('getProfileSummary', {}); this.setData({ summary: data }) }
    catch (error) { this.setData({ error: error.message || '个人信息读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  copy() { if (this.data.summary && this.data.summary.points.invite_code) wx.setClipboardData({ data: this.data.summary.points.invite_code }) },
  invite() { open('/pages/invite/index') },
  enter(event) { const item = this.data.menus[event.currentTarget.dataset.index]; if (item) open(item.path) }
})
