const { request } = require('../../services/api')
const { open } = require('../../services/navigation')
Page({
  data: { balance: '—', items: [], nextPage: null, categories: [{ id: '', name: '全部' }], categoryWidth: 170, category: '', loading: false, submitting: false, error: '', balanceError: '', categoryError: '', listError: '' },
  onLoad() { this.exchangeKeys = {}; this.balanceVersion = 0; this.hidden = false; this.refreshPending = false },
  onHide() { this.hidden = true },
  onShow() {
    if (this.hidden) { this.refreshPending = true; this.balanceVersion += 1 }
    this.hidden = false
    if (this.refreshing || this.data.loading) return
    this.refreshPending = false
    return this.load()
  },
  async load(append = false) {
    if (typeof append !== 'boolean') append = false
    if (append) return this.loadList(true)
    if (this.refreshing || this.data.loading) return
    this.refreshing = true
    const balanceVersion = this.balanceVersion = (this.balanceVersion || 0) + 1
    this.setData({ loading: true, balance: '—', error: '', balanceError: '', categoryError: '' })
    const list = this.loadList(false)
    try {
      await Promise.all([
        request('getPointsCenter', {}).then(({ data }) => { if (balanceVersion === this.balanceVersion) this.setData({ balance: data.balance }) }).catch(error => { if (balanceVersion === this.balanceVersion) { this.setData({ balanceError: error.message || '读取失败' }); this.showErrors() } }),
        request('listDiyMaterials', { catalog_type: 'BEAD', category_id: null }).then(({ data }) => {
          const categories = [{ id: '', name: '全部' }].concat(data.categories)
          // Skyline needs an explicit content span; reserve complete labels plus padding and gaps.
          const categoryWidth = 64 + categories.reduce((width, item) => width + Math.max(88, Array.from(item.name).length * 28 + 50), 0) + Math.max(0, categories.length - 1) * 16
          this.setData({ categories, categoryWidth })
        }).catch(error => { this.setData({ categoryError: error.message || '读取失败' }); this.showErrors() }),
        list
      ])
    } finally {
      this.refreshing = false
      if (this.refreshPending && !this.hidden && !this.data.loading) { this.refreshPending = false; return this.load() }
    }
  },
  showErrors() { this.setData({ error: [[this.data.balanceError, '积分余额'], [this.data.categoryError, '珠子分类'], [this.data.listError, '兑换商品']].filter(row => row[0]).map(row => row[1] + '：' + row[0]).join('；') }) },
  async loadList(append = false) {
    if (append && (this.data.loading || !this.data.nextPage)) return
    const version = this.listVersion = (this.listVersion || 0) + 1
    const category = this.data.category
    const pageToken = append ? this.data.nextPage : null
    this.setData({ loading: true, listError: '', ...(append ? {} : { items: [], nextPage: null }) })
    this.showErrors()
    try {
      const { data } = await request('listPointsExchangeSkus', { category_id: category || null, page_token: pageToken, page_size: 20 })
      if (version !== this.listVersion) return
      const items = data.items.map(item => ({ ...item, url: (data.image_urls || {})[item.image_file_id] || '' }))
      this.setData({ items: append ? this.data.items.concat(items) : items, nextPage: data.next_page_token })
    } catch (error) { if (version === this.listVersion) { this.setData({ listError: error.message || '读取失败' }); this.showErrors() } }
    finally {
      if (version === this.listVersion) {
        this.setData({ loading: false })
        if (this.refreshPending && !this.hidden && !this.refreshing) { this.refreshPending = false; return this.load() }
      }
    }
  },
  chooseCategory(event) {
    const category = event.currentTarget.dataset.id
    if (category === this.data.category || !this.data.categories.some(row => row.id === category)) return
    this.setData({ category })
    return this.loadList(false)
  },
  async exchange(event) {
    if (this.data.submitting) return
    const item = this.data.items.find(row => row.sku_id === event.currentTarget.dataset.id)
    if (!item) return
    this.setData({ submitting: true, error: '' })
    try {
      const confirmation = await new Promise(resolve => wx.showModal({ title: '确认兑换', content: item.item_name + '，消耗 ' + item.points_cost + ' 积分，获得免费 1 颗兑换券。', success: resolve, fail: () => resolve({ confirm: false }) }))
      if (!confirmation.confirm) return
      if (!this.exchangeKeys[item.sku_id]) this.exchangeKeys[item.sku_id] = 'exchange_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      const balanceVersion = this.balanceVersion
      const { data } = await request('exchangePointsForSkuCoupon', { sku_id: item.sku_id, exchange_key: this.exchangeKeys[item.sku_id] })
      delete this.exchangeKeys[item.sku_id]
      const currentBalance = balanceVersion === this.balanceVersion && !this.hidden
      this.balanceVersion += 1
      if (currentBalance) this.setData({ balance: data.points_balance })
      else this.refreshPending = true
      wx.showToast({ title: '兑换成功，可去 DIY 使用', icon: 'none' })
      if (this.refreshPending && !this.hidden && !this.refreshing && !this.data.loading) { this.refreshPending = false; await this.load() }
    } catch (error) { this.setData({ error: error.message || '兑换未确认，请重试' }) }
    finally { this.setData({ submitting: false }) }
  },
  more() { if (this.data.nextPage) return this.loadList(true) },
  coupons() { open('/pages/coupons/index') },
  ledger() { open('/pages/points-ledger/index') }
})
