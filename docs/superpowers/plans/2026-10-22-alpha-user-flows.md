# Alpha 页面与真实业务闭环 Implementation Plan

> **For agentic workers:** 使用 subagent-driven-development；按任务实施、规格复核、质量复核。主任务负责集成、平台操作和运行验收。执行不在批次间要求用户重复确认。

**Goal:** 按已确认对标布局完成四个 Tab 和 P0 业务，使用户可以使用开发环境中的测试数据人工验证功能；完整范围包括设计、交易、积分邀请及其管理操作，不能以页面壳或少数接口通过替代完成。

**Architecture:** 继续 business-api 模块化单体、薄 Handler、领域 Service、20 表原子 DAO、同连接 UnitOfWork。原生 Skyline 小程序，现有 Vue 管理端。保留现有用户改动；不迁数据库、不换 AppID、不改登录策略、不发布正式版。

**Tech Stack:** TypeScript、Node.js、mysql2、Vue 3/Vite、原生小程序 Canvas 2D、CloudBase 开发环境 stone-d3gga4t2g2ffaedb6。

## 已批准的页面与范围

页面依据和源码偏差的专项核对见 [2026-10-22 布局与动线清单](../../reference/ui-layout-audit-2026-10-22.md)。当前按用户要求先核对布局，不将未明确的中间页或操作方式擅自定为需求。

- 四个 Tab：首页、好物、DIY、我的。首页品牌/Banner及并排主入口；不包含游戏、设计广场。
- 好物起始页为搜索和纵向分类入口；下一级为横向图文商品条目；详情大图/规格/数量，下方固定客服、加购物车、立即购买。
- DIY 起始页为近期设计横向卡片、更多、手串定制入口；下一级编辑器上方状态、中部画布、下方保存/完成设计、底部左分类右 SKU 网格。
- 我的顶部四位邀请码卡；下方优惠券、积分与兑换、购物车、订单、地址、客服、条款。我的设计主入口归 DIY。
- 积分/优惠券/邀请为二级页面；兑换只针对 BEAD、一次一个 SKU 免费一颗权益；设计预计免费和订单实际核销分离。
- 基础工整排版，白底灰线和单一强调色；不创建额外营销标语、统计或装饰交互。图片使用本项目测试素材，不复制对标品牌素材或用户信息。
- 技术方案 r848、PRD r733、汇报方案 r502；旧图上的游戏、我的设计大卡片不覆盖后续已批准调整。新接口参考快照见 docs/reference/alpha-*.xml。

## 当前基线

- feat/foundation 原目录开发，保留 README 删除及上一轮显式 index 导入修复；不创建导致工具路径变化的工作区。
- 开工实测 22 文件、290 项单测通过；20 表和基础 DAO 已有，不重建。
- 当前仅有商品目录/库存/配置业务，不能声称已存在完整 Alpha。

## 执行任务与验收

### 1. 首页、好物与四 Tab 基础布局

Files: miniprogram/app.json、pages/home/**、pages/catalog/**、pages/products/**、pages/product/**、pages/diy/**、pages/profile/**、styles/alpha.wxss、services/navigation.js；tests/unit/alpha-navigation.test.ts、alpha-catalog.test.ts。

- [ ] 先写配置/页面控制器测试，实际观察四 Tab、分类到列表、搜索输入及点击跳转缺失的失败。
- [ ] 实现 getPublicSiteConfig 首页真实读取、配置入口与客服显示，四 Tab 切换和二级页面返回。
- [ ] 分类入口与商品列表拆开；复用既有查询契约，必要搜索参数向后兼容扩展并测试真实分页/过滤。
- [ ] 商品详情恢复固定操作栏，操作接真实购物车与结算业务，不虚构成功。
- [ ] 类型检查、模板检查、模拟器逐页截图与真实点击验证；平台错误保留原文并记入记录。

### 2. 积分、邀请、兑换券与个人中心

Files: contracts/src/points.ts、backend/src/services/points-service.ts、referral-service.ts、profile-service.ts；business-api/src/handlers/points-handlers.ts、points-registry.ts、入口；tests/unit/points-*.test.ts；小程序 profile、points、points-mall、coupons、invite 页面。

- [ ] 依据 alpha-account/profile/points/services.xml 固定方法与 JSON，先测身份隔离、账户创建/邀请码碰撞、签到日期/重复、兑换余额/幂等、绑定/首单奖励。
- [ ] UnitOfWork 保证账户查询时先创建；生成四位大写字母数字邀请码、先查重复并用唯一约束兜底，邀请码不为 null。
- [ ] 实现积分中心/流水、签到、BEAD SKU 商城、兑换和券读取、邀请绑定/记录及 Profile 摘要；首单奖励为订单完成事务内可复用方法。
- [ ] 前端接真实请求，按状态渲染，积分活动关闭、余额不足和占用券给出明确反馈。
- [ ] 实际用户操作和受控夹具验证积分/券/流水一致性，不把 vi.mock 记录当数据库证据。

### 3. 设计、DIY 与购物车

Files: backend/src/services/design-service.ts、cart-service.ts、对应 Handler/registry/contracts；miniprogram/pages/designs/**、design/**、editor/**、cart/**；services/design-model.js；tests/unit/design-*.test.ts、cart-*.test.ts。

- [ ] 先按 alpha-design/cart.xml 测版本归属、保存/改名、历史/复制、数量合并和软删除恢复；测试空白和错误输入。
- [ ] 设计有序组件、同内容版本规则、历史快照、当前材料可售状态、固定购物车设计版本。
- [ ] Canvas 点击添加/选中删除/拖动排序和用量/周长/预计价更新，草稿本地恢复；保存走真实接口。
- [ ] 免费券普通分类标记、虚拟筛选与本设计剩余数；编辑不锁券不占库。
- [ ] 购物车统一条目、勾选/全选、数量/删除、失效状态与结算入口。

### 4. 地址、结算、订单与支付

Files: address-service.ts、checkout-service.ts、order-service.ts、payment-service.ts、相应入口/契约；确认订单/订单列表详情页面；支付 HTTP 函数与定时任务。

- [ ] 按 alpha-checkout.xml 和技术方案 5.7/5.8 补充完整契约及事务测试，地址单选默认、省份运费和后端核价。
- [ ] 同 checkout_key 创建原订单，快照/券锁定/库存预占同事务，5 分钟截止、继续支付、关单释放和重复回调幂等。
- [ ] 检查真实微信商户与集成函数前置条件；有凭据才执行真实支付，不以模拟支付冒充成功。未具备的外部前置项记录，不阻塞无关代码。
- [ ] 管理端订单详情、发货和完成，完成时同事务触发首笔订单邀请奖励；每日北京时间 13:00 对账及管理端异常处理。

### 5. 管理操作、开发测试数据与人工验收

Files: admin-web 对应业务页面、scripts/seed-alpha-dev.ts、tests/cloud/alpha-*.ts、docs/progress/alpha-user-flows.md、docs/verification/alpha-manual.md。

- [ ] 管理端补规则/首页客服/运费配置、设计订单/权益查询与对账处理；仅实现真实存在的后端能力。
- [ ] 种子只写已核实开发环境：幂等的开发分类、商品、多规格材料、图片、积分规则；用户夹具绑定真实测试用户，不新增公开的任意 UID/余额修改接口。
- [ ] 每个功能人工步骤写清入口、前置数据、操作和预期结果；空态、错误态、券不足/库存不足与订单各状态都有受控夹具。
- [ ] 本地全量检查、真实数据库检查、开发部署、模拟器/浏览器实际点击，核对数据持久化与隔离。
- [ ] 按需推送开发分支；不上传密钥、不合并 main、不发布小程序正式版。

## 进度与完成规则

每步过程记 docs/progress/alpha-user-flows.md。任务只有代码与对应验收均有证据才完成。截图未覆盖的菜单/手势先区分正文明确要求和未固定细节，记录依据后再处理，不能以当前代码反向定义需求；不添加五行营销、口令兑换或退款审批等未批准范围。整体 goal 只有全部要求得到逐项验证后才完成，不能因一批页面完成缩小范围。
