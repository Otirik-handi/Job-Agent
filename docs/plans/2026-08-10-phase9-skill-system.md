# Phase 9：Skill 系统落地（P1-1）

日期：2026-08-10
状态：草稿
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

- [ ] **T0 规范先行**：03-agent 规范补充 Skill 系统约定——目录结构（skills/<name>/SKILL.md）、frontmatter（name/description 必填）、正文 ≤500 行与 references/ 组织、readSkill 工具契约（限定目录/防路径穿越/返回正文 markdown）、元数据常驻注入约定
- [ ] **T1 skill 内容编写（6 个）**
  - [ ] `skills/resume-analysis/SKILL.md`：简历评分卡（结构化/证据强度/亮点排序/改进建议框架）
  - [ ] `skills/jd-analysis/SKILL.md`：JD 解析规则（职责/硬性要求/软性要求/关键词抽取/红线）
  - [ ] `skills/job-matching/SKILL.md`：匹配框架（简历-JD gap 分析/匹配度评分维度/风险标注）
  - [ ] `skills/cover-letter-generation/SKILL.md`：求职信模板（结构/个性化要点/真实经历锚定原则）
  - [ ] `skills/interview-prep/SKILL.md`：面试准备（STAR 框架/题库分类/自我介绍结构/向面试官提问清单）
  - [ ] `skills/offer-evaluation/SKILL.md`：offer 比较框架（薪资/成长/团队/地点等维度与权衡方法）
  - 每个 SKILL.md 符合规范（frontmatter 两字段 + 中文正文 + 长内容拆 references/）
  - ✅ **Checkpoint A**：6 个 skill 文件就位，frontmatter/结构校验通过
- [ ] **T2 运行时机制**
  - [ ] 新增 `src/agent/tools/read-skill.ts`：inputSchema（skillName，zod enum 或校验存在性），读取 skills/<name>/SKILL.md 正文返回（含 frontmatter 解析出的 name/description）；路径穿越防护（只允许 skills/ 下已知 skill）；不存在返回结构化错误（复用 {ok:false,error:{code,message,hint}} 契约）
  - [ ] `src/agent/context.ts` 的 buildSystemPrompt 增加 Skill 元数据段（遍历 skills/ 目录读 frontmatter，输出 name+description 列表；目录读取失败容错）
  - [ ] SYSTEM_PROMPT 增加 skill 说明（可用的 skill 及何时调用 readSkill；skill 正文按需加载，避免全量常驻）
  - [ ] 注册 readSkill 进 getTools()
  - ✅ **Checkpoint B**：readSkill 单测通过（正常读取/未知 skill/路径穿越拒绝）；buildSystemPrompt 含元数据段
- [ ] **T3 验证收尾**：`npm run lint && npx tsc --noEmit && npm test` 全绿；构建通过

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1/T2 → T3
- T1 与 T2 可并行（内容编写 vs 运行时机制，文件不冲突）

## 验收标准

1. 6 个 skill 文件符合 agentskills.io 规范（frontmatter/正文/引用）
2. readSkill 按需加载生效（单测覆盖正常/异常/越界）
3. system prompt 含 skill 元数据段（常驻仅元数据，正文按需）
4. 全量 lint/tsc/test 通过
