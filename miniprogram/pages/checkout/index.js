const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
const { money } = require('../../services/format')
const { requestOrderPayment } = require('../../services/payment')
const INTENT = 'stone.checkoutIntent'
function intents() {
  const value = wx.getStorageSync(INTENT)
  if (value && value.sourceKey && value.payload) return { [value.sourceKey]: value }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function clearIntent(sourceKey) {
  const value = intents(); delete value[sourceKey]
  if (Object.keys(value).length) wx.setStorageSync(INTENT, value)
  else wx.removeStorageSync(INTENT)
}
Page({
  data: { quote: null, items: [], addressId: '', loading: false, submitting: false, error: '', phase: '', totalText: '—', goodsText: '—', discountText: '—', shippingText: '—', canSubmit: false },
  onLoad(options) {
    this.options = options
    if (options.cart_item_ids) this.source = { cart_item_ids: [...new Set(String(options.cart_item_ids).split(',').filter(Boolean))].sort() }
    else if ((options.item_type === 'STANDARD' && options.sku_id) || (options.item_type === 'DESIGN' && options.design_version_id)) {
      const quantity = Number(options.quantity || 1)
      if (Number.isInteger(quantity) && quantity > 0 && quantity <= 999) this.source = { item_type: options.item_type, sku_id: options.item_type === 'STANDARD' ? options.sku_id : null, design_version_id: options.item_type === 'DESIGN' ? options.design_version_id : null, quantity }
    }
    if (!this.source) this.setData({ error: '购买链接不完整，请返回商品或购物车重新选择' })
  },
  async onShow() {
    if (!this.source || this.data.submitting) return
    const selected = wx.getStorageSync('stone.selectedAddressId')
    if (selected) { wx.removeStorageSync('stone.selectedAddressId'); this.setData({ addressId: selected }) }
    return this.load()
  },
  async load() {
    if (!this.source || this.data.loading || this.data.submitting) return
    this.setData({ loading: true, error: '', canSubmit: false })
    try {
      const { data } = await request('listAddresses', {})
      let address = data.addresses.find(row => row.address_id === this.data.addressId)
      if (!address) address = data.addresses.find(row => row.is_default) || data.addresses[0]
      if (!address) { this.setData({ addressId: '', quote: null, items: [], error: '请先添加收货地址' }); return }
      this.setData({ addressId: address.address_id })
      const sourceKey = JSON.stringify({ ...this.source, address_id: address.address_id }), previous = intents()[sourceKey]
      if (previous && previous.sourceKey === sourceKey && previous.payload && previous.quote) {
        this.pendingPayload = previous.payload; this.applyQuote(previous.quote)
        this.setData({ error: '上次提交结果尚未确认，点击提交将查询或恢复原订单' }); return
      }
      this.pendingPayload = null
      const action = this.source.cart_item_ids ? 'previewOrderFromCart' : 'previewDirectOrder'
      const { data: quote } = await request(action, { ...this.source, address_id: address.address_id })
      this.applyQuote(quote)
    } catch (e) { this.setData({ quote: null, items: [], error: e.message || '订单预览失败，请重试' }) }
    finally { this.setData({ loading: false }) }
  },
  applyQuote(quote) {
    this.setData({ quote, items: quote.items.map((item, index) => ({ ...item, index, imageUrl: (quote.image_urls || {})[item.image_file_id] || '', amountText: money(item.line_amount_cent), discountText: money(item.discount_amount_cent), freeCount: item.applied_sku_coupons.reduce((sum, coupon) => sum + coupon.free_quantity, 0) })), goodsText: money(quote.goods_amount_cent), discountText: money(quote.discount_amount_cent), shippingText: money(quote.shipping_fee_cent), totalText: money(quote.total_amount_cent), canSubmit: !!quote.quote_hash && !!quote.items.length && quote.items.every(item => item.purchasable) })
  },
  chooseAddress() { if (!this.data.submitting && !this.data.loading) open('/pages/addresses/index?select=1') },
  async submit() {
    if (this.data.submitting || this.data.loading || !this.data.canSubmit || !this.data.quote) return
    if (this.orderNo) { wx.redirectTo({ url: query('/pages/order/index', { order_no: this.orderNo }) }); return }
    this.setData({ submitting: true, error: '', phase: '正在创建订单…' })
    let order = null
    try {
      const quote = this.data.quote, sourceKey = JSON.stringify({ ...this.source, address_id: this.data.addressId })
      let payload = this.pendingPayload
      if (!payload) {
        const fingerprint = JSON.stringify({ sourceKey, items: quote.items.map(item => ({ cart_item_id: item.cart_item_id, quantity: item.quantity })) })
        const stored = intents(), previous = stored[sourceKey]
        const key = previous && previous.fingerprint === fingerprint ? previous.payload.checkout_key : 'checkout-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2)
        payload = this.source.cart_item_ids ? { checkout_key: key, quote_hash: quote.quote_hash, cart_items: quote.items.map(item => ({ cart_item_id: item.cart_item_id, quantity: item.quantity })), address_id: this.data.addressId } : { ...this.source, checkout_key: key, quote_hash: quote.quote_hash, address_id: this.data.addressId }
        stored[sourceKey] = { sourceKey, fingerprint, payload, quote, createdAt: Date.now() }
        wx.setStorageSync(INTENT, stored); this.pendingPayload = payload
      }
      const { data } = await request(this.source.cart_item_ids ? 'createOrderFromCart' : 'createDirectOrder', payload)
      order = data; this.orderNo = data.order_no; clearIntent(sourceKey); this.pendingPayload = null
      if (data.requires_payment) { this.setData({ phase: '正在连接微信支付，请勿重复操作' }); const result = await requestOrderPayment(data.order_no); if (result.state === 'CONFIRMING') this.paymentNote = '支付结果确认中，请刷新订单状态'; else if (result.state === 'PENDING') this.paymentNote = '订单已创建，可在本订单继续支付' }
    } catch (e) {
      if (order) this.paymentNote = '订单已创建，' + (e.message || '暂未调起微信支付，可在本订单继续支付')
      else if (e.code === 'CHECKOUT_CHANGED') {
        this.pendingPayload = null; clearIntent(JSON.stringify({ ...this.source, address_id: this.data.addressId }))
        const latest = e.data && (e.data.quote || e.data)
        if (latest && latest.quote_hash) this.applyQuote(latest)
        else { this.setData({ canSubmit: false }); }
        this.setData({ error: '价格、优惠或结算内容已变化，请重新确认后再提交' })
      } else this.setData({ error: e.message || '提交结果尚未确认，请重试；将复用原订单请求' })
    } finally {
      this.setData({ submitting: false, phase: '' })
      if (this.orderNo) wx.redirectTo({ url: query('/pages/order/index', { order_no: this.orderNo, payment_note: this.paymentNote || '' }) })
    }
  },
})
