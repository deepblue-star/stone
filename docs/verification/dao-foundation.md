# 全表 DAO 验证记录

日期：2026-10-22（北京时间）；分支 feat/foundation；开发环境 stone-d3gga4t2g2ffaedb6。

## 完成范围

已按确认清单实现 20 个逐主表 DAO，完整工厂共 20 项，旧目录工厂保留八项。只有数据访问能力，不代表 20 个业务模块完成；没有新增对外 action、空 Service、表或前端页面。实现检查点之后，已依用户新授权推送并更新开发环境，见下方部署记录。

方法及调用前提见 [DAO 使用约定](../backend/dao.md)，过程见 [开发记录](../progress/dao-foundation.md)。本次只对既有 AdminCatalogService 做必要事件时间传递，使 DAO 不再决定退分事件时间；原有业务顺序不变。

## 实际证据

| 检查 | 结果 |
|---|---|
| 开工测试基线 | 20 文件、143 项通过 |
| 最终 npm run typecheck | 后端/测试与 Vue 类型检查通过 |
| 最终 npm run test:unit | 21 文件、287 项通过，其中新 DAO 文件 143 项，另有一项新的 Service 时间复用回归 |
| 新增用例的红绿过程 | 初始 17 项缺失失败，扩展后 128 项失败；技术分页、近期扫描、旧方法返回值/时间传递、DATE 投影和数值游标分别观察失败后修复 |
| SQL 与参数测试 | 检查实际 DAO 生成的 SQL、参数顺序、所属用户、空批量、状态/旧值条件、返回 0/多行、不可变表方法边界，不模拟整个 DAO |
| 同连接 UnitOfWork | 实际调用全部 20 个 DAO 的查询，记录均在一次 acquire/begin/commit/release 内完成；现有回滚异常路径测试保留 |
| npm run build | 通过；既有约 946 kB SDK 主包告警仍保留 |
| db:verify | 真实 20 表字段、类型、注释、索引等检查通过；DDL 未改变 |
| npm run test:integration | 真实结构检查 1 项通过，2 项原生事务因本机无 VPC 路由条件跳过，没有计为通过 |
| 独立审查 | 规格与质量审查、修正后复审均通过；最终质量审查者独立执行 typecheck/287 项单测通过 |

## 只读 MySQL SQL 检查

由 STONE_DAO_CAPTURE_SQL=1 运行 DAO 测试导出合成 SQL/参数，最终捕获 142 次调用、131 种不同 SQL 结构。对固定开发环境以 --read-only 执行普通 EXPLAIN，最终 131/131 通过，查询、写入语句均只解释执行计划。

- 不使用 EXPLAIN ANALYZE，不执行 INSERT/UPDATE 原句，不创建测试数据或临时云函数，不更改权限和环境配置。
- 两条日期过滤用例故意将注入测试字符串作为 DATE 值；优化器会检查其类型并拒绝。原失败结果保留，SQL 结构核对使用有效账单日 2026-10-21。这个调整只适用于诊断夹具，不修改 DAO、测试断言或业务数据，不代表非法日期被业务接受。
- 最终 SQL 结构摘要 SHA-256：`6c3d0c52973c70cecbf69ac1b75d7fb20072597e71dfb22e34bbbe335230bfcd`。摘要输入为捕获 SQL 去重、排序后的 JSON 数组，不含参数；脱敏元数据见 [dao-sql-evidence.json](dao-sql-evidence.json)。
- .local/ 中保留原始合成夹具和分阶段/最终结果，均 Git 忽略；不含实际业务凭据。源码测试可重新导出合成夹具。

只读计划检查验证字段引用和 SQL 结构，不验证写入后的数据、检查约束触发、锁等待、死锁或事务隔离；内存 executor 绑定测试也不是新业务并发事务实测。本轮未执行新的真实业务写入，后续 Service 联调需按实际流程补充。

## 审查修正

- 旧 mutation helper 统一返回原始影响行数或新 ID；0 行结果由 Service 解释，不吞错误或假装成功。
- 业务退分时间由 Service 一次创建、传入每张券；DAO 只绑定该参数，updated_at 仍由数据库维护。
- 账单日 DATE 显式 CAST 为字符串，避免当前 mysql2 默认解码为 Date 与声明不符。
- 库存流水游标的数值主键比较/排序使用限定列，不被 CAST(id AS CHAR) 的字符串别名遮蔽。只读合成 SELECT 验证了 9/10 在两种排序中的差异，未写入记录。

本轮无 UI、表结构、认证、密钥、商家端部署、小程序发布或在线文档变更。保留现有用户 README 删除，未纳入提交。

## 开发环境推送与部署（2026-10-22）

- 业务代码提交 1c4ab057fae5f7741b5807bc5d9b943ba9282df6 已推送 feat/foundation，包含此前 Skyline 提交。通过远程 ls-remote 核对，不以本地远程跟踪引用代替远端结果。
- business-api 仅代码更新成功：Active、8298116 字节，平台请求 e8ea384d-45d0-444f-96ab-5a818b5aaf40。原有密钥、VPC、运行时、角色、超时与内存保持一致，没有全量配置覆盖。
- 构建入口 index.js SHA-256：4E3664B6E8B6236E7805AA095918DFCA24E273B8E29B003ACBFB7A7E21083433。部署前再次执行 typecheck、287 项单测、build 均通过；原有大包告警仍保留。
- 商家网页无代码/产物变化，不重复部署；小程序改动仅推送源码，未上传体验版或发布正式版。本次没有合并 main、新增业务 action 或执行数据库写入。

实际登录并读取的结果：

| 接口 | 结果 | 请求标识 |
|---|---|---|
| getPublicSiteConfig | OK | 01f73528-cd72-11f1-acda-525400e4cc6c |
| getSiteConfig | OK | 0204459f-cd72-11f1-b743-52540059feef |
| listAdminCategories | OK | 021290ab-cd72-11f1-8852-525400a9be57 |
| getAdminCatalogItem | OK | 022150a2-cd72-11f1-9790-525400c50ece |
| listInventoryMovements | OK | 024f1b09-cd72-11f1-b743-52540059feef |
| listStandardCategories | OK | 025a081a-cd72-11f1-872b-525400655719 |
| getStandardItemDetail | OK | 0265b7ee-cd72-11f1-9387-5254005dc47f |

额外图片复查请求 0373cb3d-cd72-11f1-bc20-5254000956fc 返回一张图片/一条映射，单字节 GET 为 206/image/png，完整长度 2272819 字节。没有输出密码、token 或签名 URL。

这轮冒烟只覆盖现有接口的读取与身份链路，并未覆盖所有新 DAO 的真实写入/并发；前述测试边界继续有效。
