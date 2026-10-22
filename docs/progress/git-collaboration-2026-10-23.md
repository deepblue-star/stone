# Git 协作分支配置记录

日期：2026-10-23（北京时间）。

## 已确认的协作方式

- 仓库：`deepblue-star/stone`，私有仓库。
- 用户确认保留正式分支 `main`，不改名为 `master`。
- 公共预发分支为 `pre`；各自功能分支通过 PR 合入 `pre`，联调后再通过 PR 合入 `main`。
- 这次操作只涉及远端分支和保护能力检查，不提交、合并或推送工作区内尚未提交的 Alpha 文件。

## 已完成

- 当前 GitHub 身份具有仓库管理员权限。
- 使用 GitHub Git References API 创建 `refs/heads/pre`，返回 HTTP 201。
- 创建基线为远端 `main`：`23fb11541872d41eb20f387aa5cd6cf587b3f918`。创建后回读，`main` 与 `pre` 均指向此提交。
- 默认分支仍为 `main`；本地当前分支仍为 `feat/foundation`，未切换或重置工作区。
- `pre` 尚未包含本地未提交 Alpha 改动；后续需要整理开发分支并通过 PR 合入。

## 尚未生效的保护规则

- GitHub 查询 `main`、`pre` 分支保护及仓库 Rulesets 均返回 HTTP 403：`Upgrade to GitHub Pro or make this repository public to enable this feature.`
- 因此两条分支当前均为 `protected: false`。PR 流程目前是协作约定，不能描述为平台已经禁止直接 push。
- 没有把仓库公开、升级付费、修改权限或用本地钩子/事后回退冒充分支保护。
- 维持私有仓库时，需要仓库所有者先取得支持私有仓库分支保护的 GitHub 套餐；之后才能启用并回读验证必须 PR、管理员同样受限、禁止强推与删除等规则。

官方依据：[受保护分支及套餐范围](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。
