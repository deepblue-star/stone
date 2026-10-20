# Stone 基础开发底座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已关联的小程序和 CloudBase 环境中完成可重复初始化的 MySQL 表结构、后端分层与事务框架、两端公共调用能力，并以真实调用和失败回滚证明其可用。

**Architecture:** 使用一个仓库和 business-api 模块化单体；小程序与商家管理端通过 action 白名单进入薄 Handler，由领域 Service 编排业务，DAO 执行参数化 SQL。UnitOfWork 管理同一事务连接及事务内 DAO；支付和定时任务在对应业务阶段复用这些公共代码。

**Tech Stack:** 微信原生小程序、TypeScript、Node.js 云函数、CloudBase MySQL 8.0、mysql2/promise；管理端技术选型以最新技术方案为准。

---

## 已验证的环境与现状

- 仓库：`https://github.com/deepblue-star/stone.git`。
- 本地目录：`D:/CodexWorkspace/stone`。
- 小程序 AppID：`wx1b4b5273e28a6c7e`。
- 已通过微信开发者工具查询到环境：`stone-d3gga4t2g2ffaedb6`。
- MySQL：`8.0.30-cynos-3.1.19.002`，管理端 SQL 查询成功，当前表数为 0。
- 当前项目是开发者工具默认模板，有未提交文件；README.md 被用户删除，保留此现状。
- 技术方案：https://lcniux4u23kj.feishu.cn/wiki/DMlxwlG6BinXJGklQG6cyNKmnad。
- 本地最近技术方案快照为 revision 841；本轮飞书读取返回授权缺失。线上方案重新读取和逐项比对是执行建表前的必经步骤。
- 管理端 SQL 能查询不代表云函数已经能使用原生 MySQL 连接；真实网络和事务验证必须单独完成。

## 范围

本轮交付数据库、公共后端、小程序公共层、管理端公共层、部署配置和验证记录。商品、DIY Canvas、购物车、订单支付、积分邀请等完整业务属于后续模块开发。本轮不建设自动现金退款。

公共 DAO 的连接注入和必要方法先落地；各模块的业务查询随模块开发补齐，不为每张表生成没有用途的通用增删改接口。

## 目标目录与职责

```text
stone/
  miniprogram/                 小程序现有模板及后续页面、services
  admin-web/                   管理端登录、路由、API 封装、开发诊断页
  cloudfunctions/
    business-api/              index、action-registry、薄 handlers
  packages/
    backend/                   services、DAO、UnitOfWork、DB、身份和日志
    contracts/                 请求响应、错误码、枚举、字段类型
  database/
    migrations/                按版本保存的建表与后续变更 SQL
    seeds/                     有标识且可清理的开发测试数据
  scripts/                     数据库初始化、结构核验、构建和开发部署
  tests/                       公共协议、权限、DAO、真实事务验证
  docs/                        启动说明、执行计划、验收记录
  project.config.json          固定 AppID，指向 miniprogram/
  cloudbaserc.json              明确开发环境和云函数部署定义
  package.json                 固定公共开发命令
```

根目录模板移到 miniprogram/ 时保留用户代码、图片和个人设置；project.private.config.json 不进入版本控制。共享包的构建结果必须包含在云函数部署包内，不能依赖本机路径在云端存在。

## Task 1：冻结开发依据和仓库结构

**Files:** `docs/development.md`、`package.json`、锁文件、`.gitignore`、`.env.example`、`tsconfig*.json`、`project.config.json`、`miniprogram/**`。

- [x] 恢复飞书只读授权，读取线上第三、四章和部署约定，记录文档版本；与 revision 841 比对后再采用 DDL。
- [x] 盘点当前未提交模板，保持已有修改；确认最新方案的管理端框架和既有 Handler/Service 名称。
- [x] 建立上方目录、运行时版本声明、依赖锁文件和公共命令；对 AppID、EnvId、数据库凭据使用集中配置。
- [ ] 配置 Git 忽略个人设置、密钥、构建产物和依赖目录；核实仓库可见性与现有协作权限，不自动扩大权限。
- [x] 在本地使用 `npm ci`、`npm run typecheck`、`npm run build` 验证安装与编译；成功标准为退出码 0。

## Task 2：原生 MySQL 连接与事务能力验证

**Files:** `packages/backend/src/db/**`、`packages/backend/src/unit-of-work/**`、`cloudbaserc.json`、`tests/unit/unit-of-work.test.ts`。

- [x] 从控制台已公开的连接配置确认原生 MySQL 接入方式、数据库账号和云函数 VPC；凭据不进入仓库、日志或聊天。
- [x] 创建连接池、事务生命周期及事务内 DAO 集合；外部服务请求不持有数据库锁等待。
- [x] 从实际云函数执行 SELECT 1，确认云函数到 MySQL 的网络、认证和依赖打包均生效。
- [x] 使用测试连接替身验证 begin、commit、rollback、release 的调用顺序；真实两表写入验证放在 Task 3 建表完成后执行。
- [x] 执行 `npm run test:unit`；事务生命周期测试与云函数 SELECT 1 均已通过。实际顺序调整为先管理通道建表，凭据齐备后再验证运行时，见实施记录 004、008、009。

## Task 3：业务表、数据库变更脚本和 DAO 公共约定

**Files:** `database/migrations/**`、`scripts/db-*.ts`、`packages/backend/src/dao/**`、`tests/integration/schema.test.ts`、`tests/integration/unit-of-work.test.ts`。

- [x] 按线上方案建立 20 张业务表：目录 3、设计 2、购物车和地址 2、订单支付与对账 5、库存 2、积分邀请兑换券 4、管理配置 2。
- [x] 若变更脚本使用版本记录表，将其明确标记为基础设施表，不算入 20 张业务表；重复运行跳过已成功版本，内容冲突则拒绝执行。
- [x] 核验所有业务表的主键、created_at、updated_at、is_deleted、字段注释、唯一索引、CHECK 和 JSON 字段；site_config 按方案以 config_key 为主键，其余业务表使用自增主键；时间使用 DATETIME 秒级存储和统一转换。
- [x] 执行原始 DDL 前核对目标 EnvId 和实际库名，并检查目标表是否存在；发现现存表时停止覆盖，先比对结构。
- [x] 建立 DAO 参数化 SQL、逻辑删除、实体映射和事务连接注入约定；只实现本轮真实验证需要的业务 DAO 方法。
- [ ] 用重复规格、重复购物车目标、幂等键冲突及非法金额等实际写入验证数据库约束，并回滚或清理本轮测试记录。
- [x] 建表后用独立标识的积分账户与积分流水测试记录验证两表同时提交和中途抛错回滚；检查失败后连接仍可复用，真实测试不得调用任何奖励或支付入口。
- [x] 执行 `npm run db:migrate`、`npm run db:verify`，再次执行迁移应无重复建表、无已应用版本重放。
- [ ] 执行 `npm run test:integration`，结构约束、真实事务提交、真实事务回滚及连接释放全部通过。

## Task 4：business-api、公共协议和权限

**Files:** `cloudfunctions/business-api/src/**`、`packages/contracts/src/**`、`packages/backend/src/auth/**`、`packages/backend/src/logging/**`、`tests/unit/api-*.test.ts`。

- [x] 按技术方案创建 action 白名单分发、薄 Handler、领域 Service 和 DAO 调用链；领域方法名与方案一致。
- [x] 固定响应字段 ok、code、message、data、request_id；业务错误、平台异常及分页协议与方案对齐。
- [x] 小程序身份读取可信平台上下文；管理端身份通过平台认证验证，并核验 admin_allowlist。
- [x] 明确校验非法 action、缺失参数、伪造用户标识、匿名管理请求和非白名单管理请求。
- [x] 建立请求 ID、必要耗时与错误日志；不得记录数据库口令、完整支付凭据、完整个人信息或整个身份对象。
- [x] 执行 `npm run test:unit`，检查成功返回、业务失败和异常路径均满足统一响应；未知 action 不可进入 Service。

## Task 5：两端公共能力与真实开发部署

**Files:** `miniprogram/services/**`、小程序开发诊断页、`admin-web/**`、`scripts/deploy-dev.*`、`docs/development.md`。

- [x] 小程序初始化目标环境，封装接口、加载态、错误提示和请求期间按钮禁用；不以固定计时器代替真实请求完成状态。
- [x] 管理端建立启动工程、基础布局、路由、登录和 API 层；生产业务管理员名单只由人工确认后加入。
- [ ] 两端通过真实 business-api 查询公开配置；只使用有标识的开发配置种子，正式页面不展示诊断信息。
- [ ] 开发诊断中验证可信身份和数据库连通性；数据库内部信息只允许可信开发/管理身份查看，普通小程序用户不获取连接信息。
- [x] 配置实际开发环境部署并核验函数包内共享依赖；支付函数和定时任务本轮不启用。
- [ ] 小程序通过开发者工具编译并实际调用；管理端运行 `npm run dev:admin` 后在浏览器验证公开和受限入口。
- [ ] 人工扫码真机确认一次；第二位开发者在另一台机器按照运行说明复现，作为双机可运行验收。

## Task 6：交付和验收证据

**Files:** `docs/verification/foundation.md`、`docs/development.md`。

- [x] 汇总 `npm run typecheck`、`npm run build`、`npm run test:unit`、`npm run test:integration`、`npm run db:verify` 的实际结果。
- [ ] 记录技术方案版本、Git 版本、数据库版本、EnvId、实际部署函数、真实请求 ID 和验证时间。
- [ ] 展示结构校验结果、事务提交与回滚证据、小程序实调和管理端登录权限结果。
- [x] 用状态分别标记通过、失败、未验证；真机和第二台电脑未实测时不能标为通过。
- [ ] 列出人工操作和剩余问题；代码审查通过后将工作提交至仓库，保留可恢复的变更历史。

## 验收矩阵

| 检查对象 | 正常路径 | 失败路径 | 通过依据 |
|---|---|---|---|
| 数据库初始化 | 空库执行成功 | 重跑、内容冲突 | 实际表结构与变更历史 |
| 多表事务 | 两表同次提交 | 第二步异常 | 回滚后两表均无本次写入，连接可复用 |
| 小程序调用 | 公开配置与本人身份 | 参数非法、伪造身份 | 真实云函数返回和请求 ID |
| 管理端鉴权 | 已授权管理员 | 未登录、普通用户 | 后端拒绝越权，非仅隐藏菜单 |
| 公共前端状态 | 成功结束加载 | 失败、重试、连续点击 | 无重复提交且状态可恢复 |
| 构建部署 | 云端真实运行 | 缺配置 | 启动明确报错、不静默降级 Mock |
| 双机开发 | 两位开发者各自启动 | 未获权限 | 启动说明可复现，权限缺口明确列出 |

## 当前执行状态说明

已完成项以上方勾选及验证记录为准。未勾选项中，数据库结构和事务已由真实 VPC 验证器通过，但本机原生事务测试因无内网路由跳过；重复 SKU 规格校验归属后续目录模块。两端实际授权调用、真机、第二台电脑和协作权限仍待验收。原“已验证环境与现状”保留开工时事实，线上方案已更新采用 revision 844。详细证据见 docs/verification/foundation.md。

## 人工依赖

- 飞书只读重新授权，用于获取最新建表依据。
- 数据库账号凭据的安全配置；需要时由主账号完成 VPC、平台授权或登录确认。
- 管理员账号/UID、第二位开发者权限及扫码真机验证。
- 微信支付商户凭据和真实收付款不属于本轮底座验收。

## 计划自查

- [x] 使用当前已验证的 AppID、EnvId 和 MySQL 实例事实。
- [x] 不将管理端查询成功当作云函数原生连接或事务已通过。
- [x] 明确线上方案重读是建表前置条件，未把缓存内容视为最新版本。
- [x] 保留用户已有模板改动，未自动恢复被删 README。
- [x] 分开自动测试、实际云端验证和人工真机/双机验证。
- [x] 不把退款、订单支付或完整业务模块扩展进本轮底座。
