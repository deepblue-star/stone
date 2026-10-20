# 基础底座验证记录

日期：2026-10-21（北京时间）。技术方案：飞书第 844 版。环境：stone-d3gga4t2g2ffaedb6。工作分支：feat/foundation。

本轮已实现底座代码并验证数据库和云函数链路；以下未验证项仍然存在，不把整个 Alpha 或完整业务模块算作完成。

实现 Git 提交：c422eef470bd93ed3a3a90c83703077b2134339a，已推送 origin/feat/foundation。最后一次本地复核为北京时间 2026-10-21 01:46，类型检查、68 项单测、构建、20 表结构核验通过；集成测试仍为 1 项通过、2 项跳过。远程 CI 结果尚未核验。

| 检查项 | 实际结果 |
|---|---|
| 20 张业务表 | 与线上方案 DDL 完整一致；逐表结构核验通过 |
| 数据库版本化 | 001_initial_schema.sql 首次 APPLIED，重复执行 SKIP；另有 1 张 _schema_migrations 记录表 |
| 字段规则 | 字段存在、类型、非空、无符号、自增、注释、公共时间、索引与 CHECK 核验通过；site_config 按方案使用 config_key 主键 |
| 严格类型检查 | npm run typecheck 通过，包括后端和 Vue |
| 干净目录安装 | 仅 package.json/lock 的临时目录执行 npm ci，229 个包安装成功 |
| 单元测试 | Skyline 修复后复跑：8 个文件、71 项测试通过；包含 3 项小程序页面配置/条件显示回归测试 |
| 本机集成测试 | 线上结构检查 1 项通过；受 VPC 网络边界限制，本机原生事务 2 项 skipped，不计为通过 |
| 真实云端事务 | 独立 VPC 云函数验证 8 个检查全部通过，见下方请求标识 |
| 构建 | npm run build 通过；CloudBase Web SDK 导致约 941 kB chunk 的体积告警保留 |
| 云函数 | business-api，Event，Nodejs18.15，Active；查询实际 MySQL 成功 |
| 管理端预览 | stone-admin-dev-002 部署成功；URL 返回 HTTP 200、HTML 正常 |
| 本地管理端页面 | 未登录访问 / 自动转 #/login；登录请求中按钮禁用，错误后提示并恢复 |
| 管理端账号与授权 | 开发商家账号及白名单已开通；SDK 密码登录和受保护接口通过；2026-10-21 用户确认浏览器登录成功 |
| 小程序运行 | Skyline 配置修复后已正常显示；实际点击检查连接，真实 wx.cloud 查询成功；请求标识见下方补充 |
| 真机与第二台电脑 | 未验证，需要实际扫码及第二位开发者复现 |
| 密钥保护 | .env、.env.local、.local/、project.private.config.json 被 Git 忽略；未将密码输出到报告 |
| 依赖审计 | 尚未通过：官方 SDK 传递依赖有 6 项告警；没有使用 force 降级 SDK |

## 真实请求证据

- 公开配置查询：`090ee7fb-bf91-4634-8a71-3ca40e1532d0`，ok=true；返回空 Banner、客服 null、入口空数组，来自真实 SQL 查询。
- 管理端无会话：`f0e4df89-159c-449e-b677-64516b771e1a`，UNAUTHORIZED。
- 未知 action：`52db2792-f55a-4f21-ac03-3f5afd790d48`，INVALID_ARGUMENT。
- 真实事务最终验证：`d9b3fbaa-d58b-49ec-9ba0-e02fd34b45fb`，ok=true；commit、rollback、connectionReuse、cartUnique、quantityCheck、eventUnique、moneyCheck、cleaned 全部 true。
- 临时验证函数已在 dry-run 核对后删除；实际云函数列表只保留 business-api。
- 再次只读查询，测试专用前缀积分账户 0 条、积分流水 0 条。

## 开发预览

https://stone-admin-dev-stone-d3gga4t2g2ffaedb6.webapps.tcloudbase.com/

服务名 stone-admin-dev，当前版本 stone-admin-dev-002，buildId 2609050160。仅部署构建产物，未上传服务端凭据。

当前体验套餐拒绝新增 localhost/127.0.0.1 安全域名，因此本地页面存在真实平台登录的环境限制。云端预览使用已授权的平台托管域名。此前浏览器自动化读取超时；2026-10-21 用户已在云端预览页面实际登录成功，浏览器登录验收依据为用户确认。

## 审查修复

独立规格审查核实 20 条 DDL 与原文一致、范围符合底座需求。独立质量审查发现回滚失败后连接可能被复用的问题；已改为销毁不确定连接，增加替代连接复用和清理失败优先级测试，复审通过。

扩展审查补齐云端验证器失败必须返回非零、购物车和订单测试数据异常清理、积分幂等和非法金额实际测试。重复 SKU 规格由后续目录业务服务验证，不擅自修改文档中的非唯一索引。

最终质量审查修复 SDK signOut 可能 resolve error 而不是 reject 的分支，增加 2 项测试；临时验证器同步转发 MYSQL_SSL。复审确认没有剩余阻断项，独立检查 68 项单测和两套 TypeScript 检查通过。

管理通道 session 实测为 +08:00，迁移历史和种子 SQL 改为显式 UTC_TIMESTAMP；本轮生成的记录已修正为 UTC。原生池每次 checkout 设置 +00:00。

## 后续验收入口

### 2026-10-21 补充：小程序模拟器联通已验证

联通页改用 Skyline 要求的自定义导航，并复用项目现有导航组件；三处条件显示改为真实数据绑定，避免未请求就显示成功。新增回归测试均先观察到预期失败，修复后全部通过。最终完整单测为 71 项，类型检查及构建通过。

实际元素点击后页面显示“公开配置读取成功”，读取 data 确认 checked=true、loading=false、error 为空；真实 request_id 为 af8a1441-ab33-4dd7-b845-40be8d7e030a。此结果替代先前“小程序运行未验证”状态，但不代表真机或第二台电脑已验收。

### 剩余人工验收

1. 扫码验证真实手机，第二位开发者按 docs/development.md 拉取运行。
2. 继续处理 SDK 传递依赖告警，正式上线前完成依赖审查。
3. 后续业务页面随模块实际验收；当前小程序模拟器联通和管理端登录已通过，不代表完整业务已实现。

开发商家账号 stone_merchant_dev 已开通；SDK signInWithPassword/getSession 及受保护 getSiteConfig 验证通过，request_id=dcd0c5ce-ccb1-11f1-acda-525400e4cc6c。2026-10-21 用户确认“登陆进去ok的”。数据库账号与此应用登录账号不同；凭据仅在本机 Git 忽略且限制当前用户访问的 .local/merchant-login.json 中。

完整流水见 [实施记录](../progress/foundation.md)，启动与命令说明见 [开发说明](../development.md)。
