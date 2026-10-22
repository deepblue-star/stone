const { request } = require('../../services/api')
Page({
  data: { customer: null, qr: '', loading: false, error: '' },
  onLoad() { this.load() },
  async load() {
    this.setData({ loading: true, error: '' })
    try { const { data } = await request('getPublicSiteConfig', {}); let qr = ''; if (data.customer_service && data.customer_service.qr_file_id) { if (data.image_urls) qr = data.image_urls[data.customer_service.qr_file_id] || ''; else { const result = await wx.cloud.getTempFileURL({ fileList: [data.customer_service.qr_file_id] }); qr = result.fileList[0] && result.fileList[0].tempFileURL || '' } } this.setData({ customer: data.customer_service, qr }) }
    catch (error) { this.setData({ error: error.message || '客服信息读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  copy() { if (this.data.customer) wx.setClipboardData({ data: this.data.customer.wechat_id }) },
  preview() { if (this.data.qr) wx.previewImage({ urls: [this.data.qr] }) }
})
