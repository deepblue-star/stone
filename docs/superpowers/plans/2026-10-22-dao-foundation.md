# 全表原子 DAO Implementation Plan

> **For agentic workers:** 使用 subagent-driven-development 执行一个完整的 DAO 实现任务，再依次做独立规格与质量审查；主 agent 完成集成验证和开发说明。按测试失败→最小实现→回归推进，不因阶段完成向用户反复询问。

**Goal:** 为技术方案 20 张业务表补齐必要、可复用、可绑定同一事务连接的数据访问能力，不实现新的业务 Service 或接口。

**Architecture:** 延续 DatabaseExecutor / mysql2 / UnitOfWork。一个主表一个 DAO，DTO/SQL 字段显式列出，不引入通用 ORM 或任意字段更新。保留现有目录 Service 所依赖的方法，新增原子方法仅执行 SQL；权限、报价、邀请码生成重试、状态转换是否合法、跨表编排由 Service 负责。状态条件可作为 SQL 的比较条件，DAO 返回 affectedRows，不自行决定业务异常或转移下一状态。

**Tech Stack:** TypeScript 5.9、MySQL 8、Vitest；现有 feat/foundation 工作目录。用户要求非必要不询问，原工程路径保持不变；不创建 worktree、不改表/认证/云环境、不部署、不改 UI。已有 README 删除不纳入提交。

## 已确认输入和边界

- 用户已确认前一轮逐表能力清单，进一步要求 DAO 不混入业务逻辑；小程序与商家端由 Handler/Service 调用同一套 DAO。
- 数据结构唯一依据 database/migrations/001_initial_schema.sql；已核对技术方案 r848 的 20 条建表 SQL 与它一致。日期/时间参数、BIGINT ID/金额精度遵循现有连接配置；不把 BIGINT 转 Number。
- 本轮覆盖表不是只创建类。除审核/流水和历史快照外有实际 insert/read/update/softDelete；对不可变表不提供改写/删除交易事实的方法。
- _schema_migrations 属于迁移工具，不新增业务 DAO。
- 现有 10 个 DAO 部分方法已被业务使用。只保留单表数据访问和必要关联查询，不将确认订单、发奖、退款、调微信接口下沉到 DAO。

## Task 1 — 20 表数据访问实现及测试

**Files:**

- 修改 packages/backend/src/dao/index.ts：从四个合并类变为逐表导出和 createDaos 工厂，工厂覆盖全部 20 表，保留已有 siteConfig/admin/pointsAccounts/pointsLedger 键。
- 新建 packages/backend/src/dao/site-config-dao.ts、admin-dao.ts、points-account-dao.ts、points-ledger-dao.ts，迁移已有实现后补方法，现有导入继续兼容。
- 新建 packages/backend/src/dao/design-dao.ts、design-version-dao.ts、cart-dao.ts、address-dao.ts、order-dao.ts、order-item-dao.ts、payment-dao.ts、payment-reconciliation-run-dao.ts、payment-reconciliation-issue-dao.ts、referral-relation-dao.ts。
- 补齐现有 packages/backend/src/catalog/{category,catalog-item,sku,reservation,inventory-movement,sku-coupon}-dao.ts；catalog/dao.ts 改为直接引用积分逐表文件，避免与全量工厂循环依赖。
- 可新建 dao/types.ts、dao/sql.ts 承载简单行类型、参数化 IN/批量占位符及分页技术边界；不建抽象基类或可传任意表名/列名的 CRUD。
- 新建 tests/unit/dao-foundation.test.ts 及按关注点命名的 dao-*.test.ts；沿用 tests/unit/catalog-dao.test.ts、backend.test.ts。

### 覆盖清单

| 表/类 | 本轮必须具备的原子能力 |
|---|---|
| catalog_categories / CategoryDAO | insert/update 分开或保留现有单 SQL save；ID/类型/分页查询；批量 ID 查询；softDelete 返回影响行数 |
| catalog_items / CatalogItemDAO | insert/update；详情/批量/分类/名称/状态分页；所属分类存在记录查询；softDelete；需要时只锁主表 |
| catalog_skus / SkuDAO | insert/update 资料（不混库存）；ID/批量/商品/规格签名和积分兑换列表；独立库存原子更新及影响行数；softDelete |
| designs / DesignDAO | insert；本人列表/详情、批量读取、事务加锁；更新名称/当前版本号；本人 softDelete |
| design_versions / DesignVersionDAO | insert；ID/批量/设计版本号查询及版本列表；不覆写 components/快照、不加普通删除方法 |
| cart_items / CartDAO | insert；本人 ID/列表/选中 ID/同目标查询（可显式含已删记录）；更新数量；恢复已删；本人批量/单条 softDelete。恢复、插入选择由 Service 编排 |
| addresses / AddressDAO | insert；本人列表/详情/默认查询；更新字段；clearDefault/setDefault 各一条 SQL；本人 softDelete |
| orders / OrderDAO | insert；ID/批量/订单号/本人幂等键/本人详情；用户和管理筛选分页、状态统计、待付款和到期扫描；调用方指定原状态/目标状态和允许字段的条件更新、独立发货字段更新。不提供任意金额 update 或删除 |
| order_items / OrderItemDAO | 单条/批量 insert；按订单或批量订单查询；不改写成交快照、不删除 |
| payment_records / PaymentDAO | insert；按 ID/订单/商户订单号/微信交易号查询，可锁；updatePrepay、条件保存可信结果。按支付标识查不能统一过滤 is_deleted 造成补偿漏单 |
| payment_reconciliation_runs / PaymentReconciliationRunDAO | insert；ID/账单日/分页查询；更新执行状态、统计、错误。不能吞错模拟幂等成功 |
| payment_reconciliation_issues / PaymentReconciliationIssueDAO | insert 或精准唯一键去重；ID/筛选分页/未处理数；更新处理字段；不删除历史 |
| order_stock_reservations / ReservationDAO | 批量 insert；按订单/SKU/状态查询及现有预占订单统计；调用者传原/目标状态的条件更新返回影响行数；不删历史 |
| inventory_movements / InventoryMovementDAO | 单条/批量 insert 支持既有四种 action；事件键查询；SKU/订单分页；不改删流水 |
| points_accounts / PointsAccountDAO | insert；ID/OpenID/邀请码/批量查询、可加锁；余额/累计字段更新和条件更新返回影响行数；不生成邀请码、不做奖励/兑换计算、不删除 |
| points_ledger / PointsLedgerDAO | insert；事件键查询；账户分页、来源/关联标识必要筛选和统计；不改删流水 |
| referral_relations / ReferralRelationDAO | insert；ID/被邀请人/邀请人分页和计数；按未奖励等数据条件记录奖励订单/时间返回影响行数；不覆盖双方、不解绑 |
| user_sku_coupons / SkuCouponDAO | insert；ID/批量/账户分页/订单/SKU查询；按账户+SKU聚合 AVAILABLE 数量；保留下架影响查询；按调用方原/目标状态更新锁定/使用/退分字段。不可在 DAO 扣/退积分或修改库存 |
| admin_allowlist / AdminDAO | insert；ID/UID/分页查询；更新显示名/启停、softDelete；不注册平台用户或生成密码 |
| site_config / SiteConfigDAO | 按 key/批量 key 查询；显式 insert/update 或固定列 upsert；不校验配置业务 JSON、不开放任意删除固定键 |

### 测试先行步骤

- [x] 建立记录真实 SQL 和 params 的 DatabaseExecutor 测试替身；先给缺失类/方法、全量工厂和返回 affectedRows 写失败用例并运行观察红灯。

```ts
const calls: { sql: string; params: readonly SqlParameter[] }[] = [];
const db: DatabaseExecutor = {
  async query<Row>(sql: string, params: readonly SqlParameter[] = []) {
    calls.push({sql, params}); return [] as readonly Row[];
  },
  async execute(sql: string, params: readonly SqlParameter[] = []) {
    calls.push({sql, params}); return {affectedRows: 0, insertId: '9007199254740993'};
  },
};
// 每个方法验证绑定的 SQL/参数，不能只断言调用了 mock。
expect(new Set(Object.values(createDaos(db)).map(dao => dao.constructor.name)).size).toBe(20);
```

- [x] 实现类型化 SQL。所有用户/筛选值/时间/分页数均绑定；动态列仅源码固定白名单。空 ID 数组不产生 IN ()；没有空 UPDATE/插入；列表有稳定排序和分页技术限制。批量 insert 不静默忽略数据，受影响行数原样交 Service。
- [x] 补所有方法的 SQL 形状、参数顺序、空数组、未命中、影响行数 0/多行、BIGINT 字符串、用户范围、已删记录例外、可选锁/稳定排序和只读不可变表测试。
- [x] 验证全量 createDaos 与现有目录工厂均能绑定同一 connection，事务内 DAO 不开新连接/不自行 commit；原有目录和基础 Service 回归不破坏。
- [x] 运行 npm run typecheck、npm run test:unit、npm run build，报告失败→修复证据和实际测试数量。不执行 migration、seed、deploy 或任何云端写入，不读取/打印凭据。
- [x] 规格审查逐表核对覆盖/职责/权限数据条件；通过后质量审查 SQL/类型/并发前提/工厂循环依赖/测试边界。问题修复后重新审查。

## Task 2 — 集成验证和交付记录

**Files:** docs/progress/dao-foundation.md、docs/backend/dao.md、docs/development.md、本计划勾选。

- [x] 文档逐 DAO 列实际方法、参数含义和返回约定，标出只读快照/流水与支付补偿的已删记录例外，明确 Service 调用前提。不写假接口、空 Service 或“整模块完成”。
- [x] 主 agent 重新运行完整测试/类型检查/构建和只读 db:verify；无 VPC 路由的本机 MySQL 测试显示 skipped，不算通过。不新增临时云函数。
- [x] 检查工作区仅包含本轮文件；密钥/私有路径扫描；本地提交检查点，不合并 main、不发布、不纳入用户 README 删除。
- [x] 汇报实际 DAO 覆盖、测试/验证边界和下一步 Service 开发；本轮不更新线上技术方案或开发安排，避免未请求的外部文档改写。

执行调整：独立审查要求修正旧 mutation helper 的返回值和事件时间归属，因此只对 AdminCatalogService 增加统一退分时间的必要参数转交，并补相关回归；没有扩展业务流程。质量审查另修正 DATE 字符串投影及既有库存流水数值游标。完整结果见 docs/verification/dao-foundation.md。
