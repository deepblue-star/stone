const { request } = require('../../services/api')
const { open } = require('../../services/navigation')
const { time, signedPoints } = require('../../services/format')
Page({
  data: { center: null, loading: false, submitting: false, error: '' },
  onHide() { this.hidden = true },
  onShow() {
    if (this.hidden) { this.refreshPending = true; this.balanceVersion = (this.balanceVersion || 0) + 1 }
    this.hidden = false
    if (this.data.loading) return
    this.refreshPending = false
    return this.load()
  },
  async load(force = false) {
    if (this.data.loading && force !== true) return
    const version = this.requestVersion = (this.requestVersion || 0) + 1
    const balanceVersion = this.balanceVersion || 0
    this.setData({ loading: true, error: '' })
    try { const { data } = await request('getPointsCenter', {}); if (version === this.requestVersion && balanceVersion === (this.balanceVersion || 0)) this.setData({ center: { ...data, recent_ledger: data.recent_ledger.map(item => ({ ...item, timeText: time(item.created_at), pointsText: signedPoints(item.points_delta) })) } }) }
    catch (error) { if (version === this.requestVersion && balanceVersion === (this.balanceVersion || 0)) this.setData({ error: error.message || '积分读取失败' }) }
    finally {
      if (version === this.requestVersion) {
        this.setData({ loading: false })
        if (this.refreshPending && !this.hidden) { this.refreshPending = false; return this.load() }
      }
    }
  },
  async checkIn() {
    if (this.data.submitting || (this.data.center && this.data.center.checked_in_today)) return
    this.setData({ submitting: true, error: '' })
    try {
      const { data } = await request('dailyCheckIn', {})
      this.balanceVersion = (this.balanceVersion || 0) + 1
      this.refreshPending = false
      if (this.data.center) this.setData({ center: { ...this.data.center, balance: data.balance, checked_in_today: this.data.center.checked_in_today || data.awarded_points > 0 || data.idempotent_replay === true } })
      wx.showToast({ title: data.awarded_points ? '签到成功 +' + data.awarded_points : '当前活动未开启', icon: 'none' })
      await this.load(true)
    } catch (error) { this.setData({ error: error.message || '签到失败，请重试' }) }
    finally { this.setData({ submitting: false }) }
  },
  ledger() { open('/pages/points-ledger/index') },
  mall() { open('/pages/points-mall/index') },
  invite() { open('/pages/invite/index') }
})
