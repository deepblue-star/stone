const { request } = require('../../services/api')
const { SubmissionGate } = require('../../services/client')
Page({
  data: { loading: false, checked: false, error: '', requestId: '', bannerCount: 0, entryCount: 0, customerService: '未配置' },
  onLoad() { this.gate = new SubmissionGate() },
  async checkConnection() {
    if (this.gate.submitting) return
    this.setData({ loading: true, error: '', checked: false, requestId: '' })
    try {
      await this.gate.run(async () => {
        const { data, requestId } = await request('getPublicSiteConfig', {})
        this.setData({ checked: true, requestId, bannerCount: data.banners.length, entryCount: data.feature_entries.length, customerService: data.customer_service ? '已配置' : '未配置' })
      })
    } catch (error) {
      this.setData({ error: error.message || '请求未完成，请稍后重试', requestId: error.requestId || '' })
    } finally { this.setData({ loading: false }) }
  }
})
