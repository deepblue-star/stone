const { createRequestClient } = require('./client')
const { envId, functionName } = require('../config')
const request = createRequestClient((action, payload) => wx.cloud.callFunction({
  name: functionName,
  data: { action, payload },
  config: { env: envId }
}))
module.exports = { request }
