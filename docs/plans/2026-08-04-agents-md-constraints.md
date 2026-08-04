# AGENTS.md 硬约束增补计划

> **元信息**：日期 2026-08-04 · 状态：生效 · 目标：从 find-work AGENTS.md 评估迁移硬约束并增补本项目 AGENTS.md · 关联规范：spec-autonomy.md（修订流程：先改规范文档再改代码）

**背景**：评估了 find-work AGENTS.md 的全部硬约束（2026-08-04 用户决策：直接迁移 11 条全部采纳，其中"不承诺伪造""不把历史设计/历史计划当作实现依据"已在本项目 AGENTS.md 中覆盖，无需重复；改造迁移仅采纳 #13"API key 只存于本地环境变量"）。共新增 10 条，新增"关键硬约束"章节。

## 恢复点

- 检查点 1：计划文档创建并提交（本文件）
- 检查点 2：AGENTS.md 增补完成并提交
- 检查点 3：计划归档打勾提交

## 任务

- [ ] **Step 1: 创建本计划文档并提交**

```bash
git add docs/plans/2026-08-04-agents-md-constraints.md
git commit -m "docs: AGENTS.md 硬约束增补计划"
```

- [ ] **Step 2: 更新 AGENTS.md**

在 `## 目录索引` 章节之前插入 `## 关键硬约束` 章节，内容如下（10 条，与现有"不能做什么"中已覆盖的"不承诺伪造经历""不把历史设计/历史计划当作当前实现依据"不重复）：

```markdown
## 关键硬约束

- 与用户沟通默认使用中文。
- 读取和编辑文本文件时优先使用 UTF-8。
- 禁止全量读取规范与文档；必须按需定位并读取与当前任务直接相关的最小范围内容。
- 敏感信息不得写入日志：包括密码、token、Provider key、完整简历文本、完整岗位描述和 LLM 请求体。
- API key 只存于本地环境变量，不写入代码、配置文件、日志或 git。
- AGENTS.md 只保留入口级硬约束；长期工程细则按 spec-autonomy.md 的规则进入 `.agents/specs`。
- 规范标题和正文使用中文；目录名和文件名使用英文 kebab-case；技术专有名词、代码符号、命令和路径可以保留英文。
- 完成阶段性改动并通过验证后必须及时 git 提交；提交信息使用 Conventional Commits，只暂存本批相关文件。
- 大规模移动或删除前后必须用 git 做阶段存档，避免误操作。
- 日志文件放到 `logs/`，临时文件放到 `tmp/`。
```

插入后提交：

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md 增补关键硬约束（迁移自 find-work 评估结论）"
```

- [ ] **Step 3: 计划归档**

将本文件头部状态改为 `完成`，本清单全部打勾，提交：

```bash
git add docs/plans/2026-08-04-agents-md-constraints.md
git commit -m "docs: AGENTS.md 硬约束增补计划完成归档"
```
