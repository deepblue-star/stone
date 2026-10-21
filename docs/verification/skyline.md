# 小程序 Skyline 兼容修复验证

日期：2026-10-21；项目 D:/CodexWorkspace/stone；对应用户粘贴的基础库 3.17.4 日志。

## 修改范围

用户确认仅修改本地 Skyline 配置、导航栏和相关样式，并补回归测试。保留 Skyline、AppID、CloudBase 环境和登录策略；未改基础库版本，未部署云函数、更新商家端或发布小程序。

| 问题 | 处理 |
|---|---|
| Skyline 不支持属性选择器 | 目录、商品规格和联通页用 is-disabled 类控制外观，原生 disabled 属性继续控制交互 |
| 导航栏 WebKit 遮罩警告 | 返回箭头改用简单边框图形，保留原有返回事件、尺寸和点击区域 |
| wx.getSystemInfo 弃用警告 | 改用 getWindowInfo/getDeviceInfo；safeArea 缺失时回退 statusBarHeight，保留合法的 0 inset |
| glass-easel 回退配置缺失 | app.json 顶层 glassEaselWebview=true，与 componentFramework 同级，保持 WebView 回退时的组件框架一致 |
| tagNameStyleIsolation 校验提示 | legacy 本身是官方合法值；本项目没有跨组件 tag 全局样式需求，移除这个可选覆盖，采用默认隔离，而不是切换渲染器 |
| 标题与价格排版 | 标题使用剩余宽度；材料入口使用官方 size=mini 后实测宽度 88px；商品卡宽度含 padding；横向 Flex 容器显式设置 row，避免 Skyline 默认 column |

官方依据：

- [app.json 配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html)。
- [Skyline WXSS](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html)：属性选择器不支持、Flex 默认方向 column、tagNameStyleIsolation 的合法值和用途。
- [glass-easel 迁移](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/glass-easel/migration.html)：Skyline 与 WebView 回退框架配置。
- [getWindowInfo](https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.getWindowInfo.html)：部分设备不返回 safeArea，需兼容。

## 已完成验证

- 新增 tests/unit/miniprogram-skyline.test.ts 的 8 项回归。首轮 5 项按预期失败；排版和横向布局分别增加失败测试，再修复通过。覆盖配置、禁用外观与原生属性、箭头、现代 API、Android/devtools/iOS 几何、安全区缺失和 0 inset，以及横向布局显式方向。
- 最终全量单测 20 文件、143 项通过，后端/测试/Vue 类型检查通过。导航栏 JS 另外执行 node --check。
- ui-ux-pro-max 采用精确 ux 检索的 Disabled States：保留清晰禁用外观和原生禁用语义；不重做视觉风格、不增加业务功能。
- 构建通过；既有 CloudBase SDK 大包告警不属于本轮修复范围。

## 缓存排查过程

工具 compile_wxml/compile_wxss 返回 success，模拟器也能显示商品目录和商品详情的真实数据与图片；但这不能证明它已加载最新修改。读取页面数据仍报 timeout waiting for automator response。

为排除继续在旧画面上改代码，临时在本地导航标题加入“文件校验”，触发刷新、清理编译缓存及文件缓存后，截图仍显示旧标题。测试标记已撤回。说明该 CLI 刷新路径没有反映磁盘最新模板；尚未确认具体是编辑器状态、缓存还是工具实现问题，不将其误报为最新页面验证通过。

截图在 Git 忽略的 .local/skyline-after.jpg、skyline-product-final.jpg、skyline-file-marker.jpg 等文件内；它们展示的是当时画面，不作为最新排版通过证据。未清理认证、本地存储或用户业务数据，未关闭窗口或丢弃编辑器未保存内容。

用户手动编译后，页面自动化恢复，运行模板出现新的 catalog-heading，但价格的运行样式仍为 block、本地为 flex。用户保存后明确授权仅重开 Stone 项目窗口；关闭完成后重新打开，最终返回 newopen，新的价格样式为 flex，截图确认已同行。未退出微信账号、未清认证或业务存储。Windows CLI 调用使用登记项目的规范路径 D:\\CodexWorkspace\\stone；未独立证明路径格式是先前故障的根因。

## 最终模拟器验证

| 检查 | 实测结果 |
|---|---|
| 真实目录读取 | 显示开发样例分类、商品图片和 ¥128.00 起，模板与样式均为本轮版本 |
| 标题与材料入口 | size=mini 后按钮运行宽度 88px，标题及说明末尾标点不再单独换行；价格 display=flex 且币种/金额同行 |
| 商品详情和规格 | 实际点击卡片打开详情；8 mm 显示 128.00，点击 10 mm 显示 168.00、库存 2 件，切回后为 128.00；重开后再次验证 10 mm 成功 |
| 数量及小计 | 8 mm 增加至 2 件，小计 256.00；减少回 1 件，原生 disabled 属性为 true |
| 返回箭头 | 新边框箭头已在详情截图显示；普通 page selector 无法跨自定义组件，真实箭头点击未验收，不冒充通过 |
| 配置位置复核 | 初次把 glassEaselWebview 放在 window 导致新的 invalid 提示；依据官方迁移文档示例移至顶层，补失败测试再修复；最终配置回归通过 |
| 最新警告过滤 | 最终刷新后分别执行 grep -i invalid / warning / deprecated 均为空；仅表示当前缓冲无这些匹配，不等于所有业务和平台错误均不存在 |
| 最终静态检查 | 20 文件、143 项单测、typecheck、build 全部通过；既有 SDK 大包告警仍保留 |

最终已查看截图：.local/skyline-catalog-verified.jpg、.local/skyline-product-verified.jpg。早期 marker/final 命名的排查截图不是最终证据，不能混用。真实返回点击、材料页面完整交互、不同设备/主题和真机效果仍单独验收。本轮未部署或发布，不代表完整 Alpha 完成。
