const { request } = require('../../services/api')
const { open } = require('../../services/navigation')
const { time, signedPoints } = require('../../services/format')
Page({
  data: { balance: '—', centerLoading: false, centerError: '', direction: null, items: [], nextPage: null, loading: false, error: '', filters: [{ name: '全部', value: '' }, { name: '获得', value: 'EARN' }, { name: '使用', value: 'SPEND' }] },
  onLoad() { this.version = 0; this.balanceVersion = 0; this.hidden = false; this.centerRefreshPending = false },
  onHide() { this.hidden = true },
  onShow() {
    const returning = this.hidden
    if (returning) { this.balanceVersion += 1; this.centerRefreshPending = true }
    this.hidden = false
    if (!this.data.centerLoading) this.centerRefreshPending = false
    return Promise.all([this.loadCenter(), this.data.loading && !returning ? undefined : this.load()])
  },
  async loadCenter() {
    if (this.data.centerLoading) return
    const version = this.balanceVersion = (this.balanceVersion || 0) + 1
    this.setData({ centerLoading: true, balance: '—', centerError: '' })
    try { const { data } = await request('getPointsCenter', {}); if (version === this.balanceVersion) this.setData({ balance: data.balance }) }
    catch (error) { if (version === this.balanceVersion) this.setData({ centerError: error.message || '积分余额读取失败' }) }
    finally {
      this.setData({ centerLoading: false })
      if (this.centerRefreshPending && !this.hidden) { this.centerRefreshPending = false; return this.loadCenter() }
    }
  },
  filter(event) { const direction = event.currentTarget.dataset.value || null; if (this.data.direction === direction) return; this.setData({ direction }); return this.load() },
  async load(append = false) {
    if (typeof append !== 'boolean') append = false
    const version = ++this.version
    this.setData({ loading: true, error: '', ...(!append ? { items: [], nextPage: null } : {}) })
    try {
      const { data } = await request('listMyPointsLedger', { direction: this.data.direction, page_token: append ? this.data.nextPage : null, page_size: 20 })
      const items = data.items.map(item => ({ ...item, timeText: time(item.created_at), pointsText: signedPoints(item.points_delta) }))
      if (version === this.version) this.setData({ items: append ? this.data.items.concat(items) : items, nextPage: data.next_page_token })
    } catch (error) { if (version === this.version) this.setData({ error: error.message || '明细读取失败' }) }
    finally { if (version === this.version) this.setData({ loading: false }) }
  },
  more() { if (!this.data.loading && this.data.nextPage) return this.load(true) },
  mall() { open('/pages/points-mall/index') }
})
