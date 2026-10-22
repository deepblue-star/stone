const tabs = ['/pages/home/index', '/pages/catalog/index', '/pages/diy/index', '/pages/profile/index']
function open(url) {
  if (tabs.includes(url)) return wx.switchTab({ url })
  return wx.navigateTo({ url })
}
function query(path, params) {
  return path + '?' + Object.keys(params).filter(key => params[key] !== undefined && params[key] !== null).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]))).join('&')
}
module.exports = { open, query }
