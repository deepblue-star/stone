# 商品目录模块实施记录

日期：2026-10-21；环境 stone-d3gga4t2g2ffaedb6；仓库 D:/CodexWorkspace/stone。

## 状态

- [x] 71 项开工基线测试通过，工作区现有 README 删除及两份登录验收文档改动保留。
- [x] 读取技术方案 r844 和 PRD r732 的相关章节，保存目录、公开查询、材料、库存及 PRD 片段。
- [x] 用户确认继续 MySQL；PRD 三处 CloudBase PostgreSQL 已改为 CloudBase MySQL，回读 revision 733。技术方案部署章节补齐实际 DDL 验证事实，回读 revision 845。
- [x] UI/UX 检索及项目设计规范已建立，未将不匹配的自动推荐冒充本项目方案。
- [ ] 后端目录与库存实现、审查。
- [ ] 管理端目录与素材操作。
- [ ] 小程序商品及材料展示。
- [ ] 云端联调、视觉验收、提交交付。

## 001 — 开发边界

本轮实现商品目录闭环，不开发完整 DIY 画布、购物车、订单支付或积分商城。下架操作涉及的既有兑换券退分属于目录一致性保护，按技术方案实现；不制造虚假兑换入口。所有测试素材/数据显式标识。

计划见 ../superpowers/plans/2026-10-21-catalog.md；设计规范见 ../../design-system/stone-catalog/MASTER.md。

## 002 — 目录后端与代码约定

- 16 个目录/库存 action 已实现，保留原 2 个配置 action；完整 SKU 保存不接收库存覆盖，库存调整通过独立幂等接口。
- 后端规格审查通过；质量审查发现并修复数组类型被强制转枚举、历史图片 JSON 结构异常两处边界。新增失败测试后修复，原 26 项目录后端测试增至 32 项。
- 复核第四章 4.4 的固定 DAO 命名，将合并的 CatalogDAO 改为 CategoryDAO、CatalogItemDAO、SkuDAO、ReservationDAO、InventoryMovementDAO、SkuCouponDAO，直接承载对应 SQL，不加空壳代理层；事务 DAO 集合继续绑定同一 connection。
- 通过 MySQL 管理通道验证 FOR UPDATE OF i 的真实语法，查询不命中任何记录；本机原生连接仍因 VPC 内网边界超时，不算云端业务事务验收。

## 003 — 私有图片与平台限制

- 现有存储为空，规则为 PRIVATE；托管预览域名属于平台已启用的 *.webapps.tcloudbase.com。
- 按官方 resource.path、auth.uid 规则尝试限定 catalog/ 公开读与指定商家写入，平台返回 OperationDenied.FreePackageDenied；回查规则仍为 PRIVATE，没有升级套餐、没有扩大匿名权限。未应用的规则草稿已删除。
- 采用服务端仅为数据库本次查询选出的目录图片签临时 URL；不提供客户端传任意文件 ID 的公共签名接口。技术方案统一接口协议增加 4.7.5，回读 revision 846，约定 image_urls 映射及 3600 秒有效期；数据库仍只保存 cloud:// 标识。
- 单批或单张图片解析失败时省略对应 URL，并记录非敏感 code/count；保存时仍严格校验当前环境/catalog路径、图片 MIME 和大小，不把文件缺失当成功。
- 内置 image_gen 生成虚构白水晶手串样图，保存 assets/samples/quartz-bracelet-generated.png，提示词与用途记录在同目录 README；未冒充真实商家商品或库存。

## 004 — 管理端与小程序界面

- 管理端已接入分类筛选、商品/SKU 编辑、动态规格表单、图片上传、独立库存调整与流水、下架/删除影响确认。
- 前端独立审查发现 reactive Proxy 不能 structuredClone、库存操作全局单槽覆盖、切分类失败显示旧商品、材料 SKU 元数据被清空四个问题。均修复并补 helper/实际 Vue mount 回归测试，复审通过；未以源码阅读替代交互测试。
- 库存未确认操作按账号/SKU/数量/原因单独保存，成功仅清理匹配操作，其他 SKU 的未知结果重试键保留。
- 小程序新增标品目录、商品详情规格选择、只读材料目录，复用 Skyline 自定义导航；购物车、支付与 DIY 画布尚未接入，页面如实说明。
- 通用 HTML 格式化器曾把 WXML 字符串表达式折行，导致实际编译失败；改为 JS 预生成 stockText，增加三页绑定表达式语法检查。原生模板编译已通过，但模拟器截图自动化仍超时，不能宣称运行验收完成。
- 添加 Vue 组件测试工具，选择与当前 Node 24.14.1 兼容的 @vue/test-utils 2.4.6；保留已知官方 SDK 传递依赖审计告警，不使用 force 降级。

## 005 — 管理端真实浏览器差异与待部署项

- 使用隔离的 agent-browser 开发会话检查旧版线上登录页。账号登录后受保护配置查询返回 UNAUTHORIZED，request_id=ca258aaa-ccb5-11f1-8ced-525400c6cd80；只核对本地会话 UID 等非敏感字段，没有输出密码或 token。
- 已安装官方 Node SDK 的 getUserInfo() 仅读 process.env；getCloudbaseContext(context) 可读平台第二参数中的 environment/environ。以真实 SDK 的合成上下文重现差异，增加请求级适配、匿名拒绝、伪造 payload 无效及并发隔离测试。适配通过独立安全复审，仍需实际部署来验证是否解释浏览器差异。
- CLI 的 fn code update 不支持 --dry-run，命令被拒绝且未更新云函数；后续应先核对目标/现有配置，再用代码更新方式保留环境变量。
- 已向用户询问是否仅更新既定开发环境的 business-api 与商家端预览；截至本条记录仍未收到确认，因此没有部署新业务代码。当前线上仍是基础底座版本，不能当作本轮目录页面。
