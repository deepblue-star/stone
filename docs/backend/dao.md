# 后端 DAO 使用约定

DAO 由小程序与管理端的后端 Service 共用，不是前端可直接调用的接口。一个类以一张主表为职责边界：查询可以包含必要的 JOIN/聚合，写入保持单表、原子化。

## 职责边界

| 放在 DAO | 放在 Service |
|---|---|
| 参数化 SQL、行投影、JSON 存取、分页和批量查询 | 权限校验、输入业务规则、对外响应内容 |
| 调用方明确传入的原状态/原值比较条件、影响行数 | 判断状态转换是否允许，解释 0 行更新的业务含义 |
| 在已有事务连接上执行 FOR UPDATE | 确定何时开启事务、加锁顺序和跨表操作顺序 |
| 新增积分/库存流水，读取历史事件 | 计算价格、生成邀请码、签到奖励、发奖、兑换、退款 |

DAO 不读取微信上下文、不调用微信或 CloudBase API、不取得独立连接、不自行 commit/rollback，也不注册 HTTP/action。管理员查询不自动等于已授权，用户查询的所属条件由 Service 从可信上下文传入。

## 数据与返回约定

- ID、BIGINT 金额和积分保持字符串，避免 JavaScript 精度丢失；SQL 投影使用明确列和必要的 CAST，不将完整数据库行直接作为对外 DTO。
- 查询未命中返回 null；列表返回数组。批量查询没有目标时返回空数组，不发送 IN ()。列表必须使用稳定排序及有界分页。
- insert 返回新 ID，或在批量场景返回原始写入结果/影响行数；update 和 softDelete 返回影响行数。0 行不是 DAO 自行判断的“失败”或“幂等成功”。
- 可变数据由明确方法修改固定字段；不接收任意 SQL、任意表名、任意列名或客户端原样 patch。
- 用户列表和本人详情通常过滤逻辑删除；支付补偿、按永久订单号/支付标识查找等特定方法保留必要的历史读取，不统一套全局过滤器。既有目录 findById 也保留已删行供 Service 判断重试/删除结果；不能将它直接当作对外可售查询。
- 设计版本、订单项目快照、积分和库存流水不提供普通修改/删除；订单、支付、预占、邀请关系、兑换券不以删除代替状态变化。
- 数据库唯一键/检查约束抛出的错误不在 DAO 吞掉或改写成成功。业务层结合操作上下文解释。

## 事务与实例

普通读取将 DAO 绑定到 DatabaseExecutor；事务内由 UnitOfWork 将同一 connection 传给 createDaos。DAO 只保存构造时的 executor，执行任何方法都不换连接。

全量 createDaos 的固定键为：siteConfig、admin、pointsAccounts、pointsLedger、categories、items、skus、designs、designVersions、cart、addresses、orders、orderItems、payments、reconciliationRuns、reconciliationIssues、reservations、inventoryMovements、referrals、skuCoupons。既有 createCatalogDaos 继续保留八项集合，维持目录 Service 调用兼容。

## 20 表覆盖清单

每个类的参数类型与 SQL 在对应文件中；下面列出实际方法入口，不表示对应业务接口或 Service 已完成。现有目录 save 每次只执行一次新增或更新，不做跨表编排。

| 主表 / DAO | 查询 | 写入 |
|---|---|---|
| catalog_categories / [CategoryDAO](../../packages/backend/src/catalog/category-dao.ts) | findById、findByIds、list | save、softDelete |
| catalog_items / [CatalogItemDAO](../../packages/backend/src/catalog/catalog-item-dao.ts) | findById、findByIds、hasAnyByCategory、list | save、softDelete |
| catalog_skus / [SkuDAO](../../packages/backend/src/catalog/sku-dao.ts) | findById、findByIds、listByItemIds、findBySpecSignature、listPointsExchange | save、updateSpec、updateStockCounters、adjustStock、softDelete |
| designs / [DesignDAO](../../packages/backend/src/dao/design-dao.ts) | findByOwnerId、findByIds、listByOwner | insert、update、softDelete |
| design_versions / [DesignVersionDAO](../../packages/backend/src/dao/design-version-dao.ts) | findById、findByIds、findByDesignVersion、listByDesign | insert |
| cart_items / [CartDAO](../../packages/backend/src/dao/cart-dao.ts) | findByOwnerId、listByOwner、findSelected、findTarget | insert、updateQuantity、restore、softDelete、softDeleteMany |
| addresses / [AddressDAO](../../packages/backend/src/dao/address-dao.ts) | findByOwnerId、listByOwner、findDefault | insert、update、clearDefault、setDefault、softDelete |
| orders / [OrderDAO](../../packages/backend/src/dao/order-dao.ts) | findById、findByIds、findByOrderNo、findByOwnerId、findByCheckoutKey、listByOwner、listAdmin、countByStatus、scanPending、scanDeadline、scanRecent | insert、updateState、updateShipment |
| order_items / [OrderItemDAO](../../packages/backend/src/dao/order-item-dao.ts) | listByOrder、listByOrderIds | insert、insertMany |
| payment_records / [PaymentDAO](../../packages/backend/src/dao/payment-dao.ts) | findById、findByIds、findByOrderId、findByOutTradeNo、findByTransactionId | insert、updatePrepay、updateProviderResult |
| payment_reconciliation_runs / [PaymentReconciliationRunDAO](../../packages/backend/src/dao/payment-reconciliation-run-dao.ts) | findById、findByBillDate、list | insert、updateState |
| payment_reconciliation_issues / [PaymentReconciliationIssueDAO](../../packages/backend/src/dao/payment-reconciliation-issue-dao.ts) | findById、list、countUnresolved | insert、updateResolution |
| order_stock_reservations / [ReservationDAO](../../packages/backend/src/catalog/reservation-dao.ts) | countPendingOrders、listByOrder、listBySku | insertMany、updateState |
| inventory_movements / [InventoryMovementDAO](../../packages/backend/src/catalog/inventory-movement-dao.ts) | findByEventKey、listBySku、listByOrder | insert、insertMany、insertAdjustment |
| points_accounts / [PointsAccountDAO](../../packages/backend/src/dao/points-account-dao.ts) | findByOpenId、findForUpdate、findById、findByInviteCode、findByIds | insert、updateBalance、updateBalanceIf |
| points_ledger / [PointsLedgerDAO](../../packages/backend/src/dao/points-ledger-dao.ts) | findByEventKey、listByAccount、sumByAccount | insert |
| referral_relations / [ReferralRelationDAO](../../packages/backend/src/dao/referral-relation-dao.ts) | findById、findByInvitee、listByInviter、countByInviter | insert、recordReward |
| user_sku_coupons / [SkuCouponDAO](../../packages/backend/src/catalog/sku-coupon-dao.ts) | listActiveBySku、findById、findByIds、listByOwner、listByOrder、listBySku、countAvailableBySku | insert、updateState、updateStates、markRefunded |
| admin_allowlist / [AdminDAO](../../packages/backend/src/dao/admin-dao.ts) | findEnabledByAuthUid、findById、findByAuthUid、list | insert、update、softDelete |
| site_config / [SiteConfigDAO](../../packages/backend/src/dao/site-config-dao.ts) | findByKey、findByKeys | upsert |

## 参数及调用前提

- `openid` 必须由 Service 从可信身份取得；不是客户端传入后直接使用。`accountId` 必须先核对属于该用户。管理端 listAdmin 等方法也必须先通过 Service 权限检查。
- `id`、`ids`、订单号、邀请码是比较条件，不会被插进 SQL 文本。`findByIds` 等内部批量读不自动代表拥有访问权，Service 仍须选择正确的 owner 查询或先查所属记录。
- 新 DAO 的 `limit/offset` 默认 50/0，技术范围为 limit 1–500、offset 0–Number.MAX_SAFE_INTEGER，非有限值回退默认、有限小数取整；对外 API 的业务分页校验仍由 Handler/Service 完成。既有目录方法保留 cursor 分页约定。
- `lock=true` 仅应在 UnitOfWork 回调内使用；在普通自动提交连接里加锁不会替代跨表事务。批量锁按稳定 ID 顺序读取；跨 DAO 的加锁顺序由 Service 统一安排。
- `expected`、`expectedState`、`expectedBalance`、库存旧值属于条件更新比较项；返回 0 时，Service 读取现状并按具体业务决定冲突、重试或幂等处理，DAO 不替它判断。
- OrderStateUpdate 是显式完整的状态/时间字段写入，Service 必须保留未变的 paid_at/shipped_at 等历史值，不得随意填 null。updateShipment 只更新发货相关字段，不覆盖成交金额或其他历史时间。
- 业务事件时间（支付成功、发货、奖励、退分等）由调用方传入；updated_at 采用数据库 UTC_TIMESTAMP 维护。Timestamp 类型为 Date 或字符串，字符串必须由 Service 规范为 UTC 数据库时间。
- 账单日 bill_date 是日历日期，查询显式 CAST 为 YYYY-MM-DD 字符串，不把它当作带时区的 Date 瞬时值。库存流水的 ID 游标按数值主键比较和排序，不按接口字符串别名排序。
- points/订单金额等新 BIGINT 输入和投影为字符串；既有 SKU 接口的 price_cent 保留已校验的安全整数 DTO，与数据库字符串投影兼容，不进行新的 Number 精度转换。
- `recordReward` 只更新邀请关系的奖励记录，`insertAdjustment` 只新增库存流水，`markRefunded` 只更新单张券。它们不会发放积分、改变库存或执行完整退款；这些动作的跨表事务仍在 Service。

## 事务调用示例

```ts
const work = new UnitOfWork(database, createDaos);

// Service 已取得可信 openid；以下两个 DAO 都使用本次同一条 connection。
const result = await work.run(async (daos) => {
  const design = await daos.designs.findByOwnerId(openid, designId, true);
  if (!design) return null;
  const versions = await daos.designVersions.listByDesign(design.id, 20, 0);
  return { design, versions };
});
```

无需把 connection 手工传进每次方法调用；不能将事务对象传给另一次云函数调用。示例是内部 Service 返回值，不是直接对前端暴露的接口。

开发与验证记录见 ../progress/dao-foundation.md；SQL 参数与边界回归见 tests/unit/dao-foundation.test.ts。本轮只扩展数据层，没有把新 DAO 自动注册为可调用业务 action。
