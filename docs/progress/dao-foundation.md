# 全表 DAO 基础能力开发记录

日期：2026-10-22（北京时间）；目录 D:/CodexWorkspace/stone；分支 feat/foundation。

## 范围

用户确认补齐 20 张表必要的数据访问操作，强调 DAO 原子化、不混业务规则，两端共用。按已确认的清单和 001_initial_schema.sql 实施；不改 UI、DDL、认证、云环境或新业务接口，不部署，不改在线文档。

## 进度

- [x] 开工基线与逐表方法清单确认。
- [x] 实际 SQL 实现和单测，覆盖全部 20 表。
- [x] 同连接事务工厂与既有 Service 回归。
- [x] 独立规格及质量审查。
- [x] 本地全量验证、开发说明、密钥扫描及提交（提交号见 Git 历史）。

## 001 — 工作区与方案

- 现有 feat/foundation，HEAD 为 9a642e9；用户原有 README 删除保持不动。沿用既定工程路径，不创建新工作区，避免影响已打开的开发者工具。
- 技术方案 r848 的 20 条 DDL 已与迁移文件核对一致；本轮不重复建表。
- 采用 writing-plans / subagent-driven-development / test-driven-development：先记录清单，由一个实现任务负责 DAO 源码与测试，随后独立规格审查和质量审查；主 agent 负责集成证据与文档。不并发修改同一组源码。
- 计划见 ../superpowers/plans/2026-10-22-dao-foundation.md。现有工厂仅配置/权限/积分四项及目录工厂八项；本轮扩展全表工厂，保留现有调用兼容。
- 开工实际运行 npm run test:unit：20 个文件、143 项通过；已有依赖不重装，不升级 SDK。独立实现任务已获得完整逐表清单、固定工厂键、职责边界与测试要求；未委托修改权限或云端数据。

## 002 — 原子能力与回归

- 从四个合并类拆为逐表文件，补齐其余业务表和既有目录 DAO 的批量/条件查询、状态比较更新。全量工厂固定 20 个键，目录工厂保持原八项，避免改变旧 Service 依赖。
- 首轮观察 17 个缺失能力失败；扩展 SQL 用例后 128 项失败，再实现。新增了空批量、所属用户、JSON/大整数、受影响行数、不可变事实、稳定分页、条件更新、存储错误透传及全部 20 个实例同连接绑定的测试。
- 新 SQL 对输入值和分页绑定参数，不接受任意表/列更新；DAO 不做权限判断、报价、邀请码生成、积分计算、合法状态转换判断或跨表编排。已实现类及方法清单见 ../backend/dao.md。
- 使用临时执行的 Prettier 格式化本轮 TypeScript 文件，未增加依赖、修改 package.json/lock 或格式化小程序页面。

## 003 — 两阶段审查与修正

- 独立规格审查覆盖 20 张表，发现旧 updateBalance/updateSpec/markRefunded/insertAdjustment 丢弃写入结果，以及 markRefunded 自行决定业务事件时间。先观察 6 个回归失败，再改为原始影响行数/新增 ID；仅对 AdminCatalogService 做必要调用适配，一次下架统一生成并传入 Date。未新增 Service 业务流程。
- 规格复审通过；独立质量审查发现 bill_date 的原始 DATE 在当前驱动返回 Date，但声明为 string。另指出旧库存流水按字符串别名排序与数值游标不一致，会跨 9/10 位数边界漏项。先观察 3 个失败测试，再改为日期 CAST 和数值主列限定排序/比较。
- 用只读 MySQL 虚拟 SELECT 独立复现：未限定的 CAST(id AS CHAR) 别名排序为 9、10，限定 t.id 数值列后为 10、9；日期 CAST 返回 2026-10-21 字符串。没有插入测试行。
- 独立质量复审通过，无剩余 Critical/Important/Minor 发现；审查者独立运行 typecheck 和 287 项用例通过。

## 004 — 验证方式与边界

- 新 tests/unit/dao-foundation.test.ts 可通过 STONE_DAO_CAPTURE_SQL=1 导出 .local/dao-captured-sql.json，包含合成测试数据的 SQL/参数，不包含业务凭据。用真实 DAO + SQL 记录 executor 验证，而不是模拟整个 DAO 的行为。
- 已使用固定开发环境的只读 EXPLAIN 校验生成 SQL；不使用 EXPLAIN ANALYZE，不执行 INSERT/UPDATE 本身，不开临时函数、不改表或云配置。故意用于注入边界的两个非法 DATE 测试值会被 MySQL 优化器拒绝，原结果保留；SQL 结构校验改用合法账单日，不能把它说成业务输入可接受。
- 20 表 db:verify 通过；本机集成检查 1 通过、2 项原生事务因 VPC 路由条件缺失跳过。新 DAO 的真实写入、并发锁竞争与跨表业务事务未在本轮执行，不用 EXPLAIN 或内存测试冒充。

## 005 — 最终检查点

- 主 agent 在修正后再次运行 typecheck、完整单测、build：21 文件、287 项通过，构建成功，已有 SDK 主包告警保留。
- 对最终源代码重新导出的 142 次合成调用去重为 131 种 SQL，普通只读 EXPLAIN 最终 131/131 通过。SQL 结构摘要和范围见 ../verification/dao-foundation.md、../verification/dao-sql-evidence.json。
- 源码无新增 any、AppError/Service/平台 API 引用或 DAO 自建事务；数据库迁移、前端、身份配置及依赖文件没有改动。全量参数/返回说明和 20 类实际方法清单已写到 ../backend/dao.md。
- 使用 finishing-a-development-branch 保留当前 feat/foundation，完成本地检查点；按用户要求不另行询问合并/发布选项。不合并 main、不创建 PR、不部署、不推送、不丢弃既有 README 删除。

## 006 — 用户授权推送与部署开发环境

- 用户明确要求执行推送及部署。先重新运行 typecheck、287 项单测和 build，均通过；随后将原本未推送的 Skyline 与 DAO 提交一起推到 origin 的 feat/foundation。远程 ls-remote 确认为 1c4ab057fae5f7741b5807bc5d9b943ba9282df6。
- 采用现有 business-api 仅代码更新，目标 stone-d3gga4t2g2ffaedb6。部署后 Active、代码包 8298116 字节，请求 e8ea384d-45d0-444f-96ab-5a818b5aaf40。更新前后环境变量、VPC、运行时、角色、超时和内存一致；没有迁库、改变凭据、登录策略、权限或套餐。
- 本地 index.js SHA-256 为 4E3664B6E8B6236E7805AA095918DFCA24E273B8E29B003ACBFB7A7E21083433。商家端构建产物与前次相同，没有重复部署；没有上传/发布小程序正式版。
- 使用既有商家测试账号通过官方 SDK 登录，7 个实际读取接口返回 OK：公开配置、受保护配置、管理分类、管理商品详情、库存流水、标准分类、标准商品详情。所有读取均指向既有开发样例，没有执行库存调整/退分/建单。
- 初次冒烟脚本把库存流水响应误写成 items，而契约为 movements；按已有契约修正诊断脚本后 7 项通过，未为使测试通过修改业务代码。只读图片复查返回 206、image/png、完整大小 2272819 字节，未输出临时签名地址。
- 7 项请求标识及配置核对结果见 ../verification/dao-foundation.md。部署记录单独提交并继续推送同一开发分支；不合并 main、不创建 PR，用户 README 删除仍不纳入。
