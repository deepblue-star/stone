const { request } = require('../../services/api')
Page({
  data: { info: null, code: '', loading: false, submitting: false, error: '' },
  onLoad() { this.setData({ code: wx.getStorageSync('stone.pendingInviteCode') || '' }); this.load() },
  async load() {
    this.setData({ loading: true, error: '' })
    try { const { data } = await request('getMyInviteInfo', {}); this.setData({ info: data }) }
    catch (error) { this.setData({ error: error.message || '邀请信息读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  input(event) { this.setData({ code: event.detail.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) }) },
  copy() { if (this.data.info) wx.setClipboardData({ data: this.data.info.invite_code }) },
  async bind() {
    if (this.data.submitting || (this.data.info && this.data.info.bound_referrer)) return
    if (!/^[A-Z0-9]{4}$/.test(this.data.code)) return wx.showToast({ title: '请输入四位大写字母或数字', icon: 'none' })
    this.setData({ submitting: true, error: '' })
    try { await request('bindReferrer', { invite_code: this.data.code, bind_channel: 'MANUAL_CODE' }); wx.removeStorageSync('stone.pendingInviteCode'); await this.load(); wx.showToast({ title: '绑定成功', icon: 'none' }) }
    catch (error) { this.setData({ error: error.message || '绑定失败' }) }
    finally { this.setData({ submitting: false }) }
  },
  onShareAppMessage() { return { title: '来设计你的专属手串', path: this.data.info ? this.data.info.share_path : '/pages/home/index' } }
})
