const { envId } = require('./config')
const { request } = require('./services/api')
App({
  onLaunch(options) {
    if (wx.cloud) wx.cloud.init({ env: envId, traceUser: true })
    this.rememberInvite(options)
  },
  rememberInvite(options) {
    const code = options && options.query && options.query.ref
    if (typeof code === 'string' && /^[A-Z0-9]{4}$/.test(code)) wx.setStorageSync('stone.pendingInviteCode', code)
  },
  async onShow(options) {
    this.rememberInvite(options)
    const code = wx.getStorageSync('stone.pendingInviteCode')
    if (this.bindingInvite || typeof code !== 'string' || !/^[A-Z0-9]{4}$/.test(code)) return
    this.bindingInvite = true
    try {
      await request('bindReferrer', { invite_code: code, bind_channel: 'SHARE_PATH' })
      wx.removeStorageSync('stone.pendingInviteCode')
    } catch (error) {
      if (['SELF_REFERRAL','REFERRAL_ALREADY_BOUND','REFERRAL_BINDING_CLOSED','NOT_FOUND'].includes(error.code)) wx.removeStorageSync('stone.pendingInviteCode')
      wx.showToast({ title: error.message || '邀请关系暂未确认，可在邀请页面重试', icon: 'none' })
    } finally { this.bindingInvite = false }
  },
  globalData: { userInfo: null }
})
