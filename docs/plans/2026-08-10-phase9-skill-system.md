# Phase 9：Skill 系统落地（P1-1）

日期：2026-08-10
状态：完成（2026-08-10 验收通过，分支 phase9-skill-system）
目标：为 job-helper 建立遵循 agentskills.io 开放标准的 Skill 系统——技能目录 + 元数据常驻 + readSkill 工具按需加载（CLI 机制同构移植），首批 6 个求职 skill。
关联规范：`.agents/specs/03-agent/agent-tooling-conventions.md`（需更新）、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（P1-1 定稿）
依据：`docs/designs/2026-08-10-agent-architecture-research.md` 专题 03（Agent Skills 标准）

## 范围

- 新增 `skills/<skill-name>/SKILL.md`（frontmatter name/description + 正文 ≤500 行，长内容拆 references/）
- 首批 6 个 skill：resume-analysis（简历评分卡）、jd-analysis（JD 解析规则）、job-matching（匹配框架）、cover-letter-generation（求职信模板）、interview-prep（面试题库+STAR）、offer-evaluation（offer 比较框架）
- 新增 `readSkill` 工具（限定 skills/ 目录，防路径穿越），注册进 getTools()
- `buildSystemPrompt` 增加 Skill 元数据段（name+description 常驻，~100 token/个）；SYSTEM_PROMPT 说明 skill 机制（何时用 readSkill）
- 不做：skill 的 scripts/ 执行、MCP 接入、用户自定义 skill 管理

## 任务清单

- [x] **T0 规范先行**：03-agent 补充 Skill 系统约定（目录结构/frontmatter/正文限长与 references/readSkill 契约/元数据注入/边界与数量 ≤15）——提交 71cdc25，审查通过
- [x] **T1 skill 内容编写（6 个）**
  - [x] skills/resume-analysis（四维加权评分卡+证据强度四级标注）、jd-analysis（硬软性/红线+原文出处）、job-matching（五维权重+gap 分级+示例输出）、cover-letter-generation（四段式模板+真实性硬约束）、interview-prep（STAR+六类题库）、offer-evaluation（五维比较+年化口径）
  - [x] 全部符合规范：frontmatter 两字段、正文 76-90 行中文、真实性原则全程体现
  - ✅ **Checkpoint A**：提交 a00e8ea，审查通过（2 条次要建议不阻塞）
- [x] **T2 运行时机制**
  - [x] `src/agent/skills.ts`：parseSkillFrontmatter（手写轻量解析）+ listSkillMetadata（容错跳过+warn+按名排序）+ readSkillContent（格式校验/白名单/路径前缀三道闸防穿越）
  - [x] `src/agent/tools/read-skill.ts`：成功 {ok:true,name,description,content}；SKILL_NOT_FOUND 结构化错误；description 4 句；只读免确认
  - [x] `src/agent/context.ts`：buildSystemPrompt 增加 Skill 元数据段（签名不变，route.ts 零改动）
  - [x] SYSTEM_PROMPT「技能（Skill）」段 + getTools 注册（14 工具）
  - [x] skills.test.ts 13 用例（解析/容错/穿越/白名单）
  - ✅ **Checkpoint B**：提交 537db56 + 72b3003（审查发现 hint 引用不存在的 listSkill 工具，已修正），86 测试全绿
- [x] **T3 验证收尾**：`npm run lint && npx tsc --noEmit && npm test`（86/86）通过；`npm run build` 通过

## 验收记录（2026-08-10）

1. ✅ 6 个 skill 文件符合 agentskills.io 规范（frontmatter/正文/引用一层深），内容实际可用
2. ✅ readSkill 按需加载生效（单测覆盖正常/异常/路径穿越三道闸）
3. ✅ system prompt 含 Skill 元数据段（常驻仅元数据，正文按需 readSkill）
4. ✅ 全量 lint/tsc/86 测试/build 通过

已知限制（后续处理）：frontmatter 不支持 YAML 块标量（单行约束，注释声明）；符号链接不在三道闸覆盖内（本地单用户威胁模型可接受，注释说明）；cover-letter 示例数字为占位（有双重声明约束）。

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1/T2 → T3
- T1 与 T2 可并行（内容编写 vs 运行时机制，文件不冲突）

## 验收标准

1. 6 个 skill 文件符合 agentskills.io 规范（frontmatter/正文/引用）
2. readSkill 按需加载生效（单测覆盖正常/异常/越界）
3. system prompt 含 skill 元数据段（常驻仅元数据，正文按需）
4. 全量 lint/tsc/test 通过
