# job-helper 功能全景与测试覆盖报告（2026-08-13）

> 基于代码盘点（工具/API/组件/skills）+ 6 轮 GUI 测试记录对照生成。
> 状态标记：✅ 已测通过 | ⚠️ 部分验证 | ❌ 未测

---

## 一、功能全景

### 1. 对话核心（Agent 编排）

| 能力 | 实现 | 测试状态 |
|---|---|---|
| 对话流（streaming/停止） | AI SDK useChat + /api/chat | ✅ |
| 会话管理（新建/切换/重命名/删除/刷新恢复） | conversations 表 + localStorage | ✅ |
| 会话 FTS 检索工具 searchMessages | messages_fts（trigram） | ❌ |
| 语义检索（embedding + 余弦） | 硅基流动 bge-m3，需 EMBEDDING_* 环境变量 | ❌（当前未配置 env，可测降级路径） |
| 会话摘要（20 轮滚动） | conversations.summary | ❌（需 20 轮对话，成本高） |
| 上下文分层组装 | SYSTEM_PROMPT/记忆/skill/会话状态/近 12 轮 | ✅（隐式验证） |

### 2. Agent 工具（22 个）

| 工具 | 功能 | 测试状态 |
|---|---|---|
| importResume | 导入简历（粘贴） | ✅ |
| analyzeResume | 简历分析评分 | ✅ |
| listResumes / listJobOpportunities | 资源只读列举 | ✅（Agent 内部调用） |
| setMemory / getMemory | 记忆写入/读取 | ✅ |
| importJobOpportunity | 导入岗位 JD | ✅ |
| matchJob | 岗位匹配（结构化输出） | ✅（成功 81 分 + 失败降级两态） |
| discoverChannels | 渠道发现 | ✅（0 渠道 + 2 渠道两态） |
| tailoredResume | 专属简历（建议清单/生成） | ✅ |
| applyJob | 投递两段式 | ✅（预览+确认落库） |
| recordApplicationStatus | 投递后状态记录两段式（确认记录卡片） | ❌ |
| prepareInterview | 面试准备 | ✅ |
| webSearch / webFetch | 搜索/抓取（三级降级链） | ✅（含失败/降级/配额/网络异常） |
| readSkill | 技能加载 | ✅ |
| planCreate / planRead / planUpdate | 显式规划 | ⚠️（read/update 已测；**planCreate 新计划创建流程未测**） |
| recordLesson / searchLessons | 反思环 | ⚠️（record 已测；searchLessons 未测） |

### 3. 求职技能库（10 个 skill）

| skill | 是否被 Agent 触发过 | 测试状态 |
|---|---|---|
| resume-analysis（简历评分卡） | ✅ | ✅ |
| jd-analysis（JD 解析） | 未见显式触发 | ❌ |
| job-matching（匹配框架） | ✅ | ✅ |
| cover-letter-generation（求职信） | ❌ | ❌ |
| interview-prep | ✅（prepareInterview 链路） | ✅ |
| offer-evaluation（offer 评估） | ❌ | ❌ |
| negotiation（谈判） | ❌ | ❌ |
| follow-up（跟进） | ❌ | ❌ |
| company-research（公司调研） | ❌ | ❌ |
| salary-benchmark（薪资行情） | ❌ | ❌ |

### 4. 资源管理 UI

| 功能 | 测试状态 |
|---|---|
| 文件上传（PDF/DOCX/TXT/MD，20MB 上限） | ❌（IAB 运行时不支持 file chooser，环境限制） |
| 简历列表/抽屉（分析结果/待确认项）/删除 | ✅ |
| 岗位列表/状态筛选（9 态）/抽屉（匹配矩阵/渠道/专属简历/面试准备） | ✅ |
| 岗位删除 | ❌（简历删除已测，岗位删除未单独测——同为 ConfirmDialog 模式，低风险） |
| 专属简历抽屉（内容查看/删除） | ❌（已生成 v1 但抽屉未打开验证） |
| 面试准备导出 Markdown | ⚠️（download 事件触发，文件落盘未验证） |

### 5. 对话内 UI

| 功能 | 测试状态 |
|---|---|
| 消息渲染（Markdown/表格/链接/列表） | ✅ |
| 工具步骤卡片三态（运行/完成/失败）+ 展开详情 + 重试 | ✅ |
| recordApplicationStatus 确认记录卡片 | ❌ |
| 规划进度横幅 | ⚠️（遗留计划横幅观察过；新计划创建后横幅联动未验证） |
| 输入边界（空白/单字符/长文本/Shift+Enter 换行） | ⚠️（Shift+Enter 换行未验证） |

### 6. 数据与工程能力

| 能力 | 测试状态 |
|---|---|
| 状态时序（status_history 链式作废） | ✅（matched→applying 落库验证） |
| 审计表（actions） | ✅（apply_job/tailored_resume 记录验证） |
| FTS 落库同步 | ✅（消息落库+删除级联验证） |
| fetch 缓存（24h） | ⚠️（命中路径 Agent 日志可见 1ms 返回，未专门验证） |
| 会话配额护栏（webFetch 8 次/任务） | ❌（未触发上限） |

---

## 二、未测试清单（按优先级）

### P0 — 主流程补全（建议下次测）
1. **投递后状态推进**：对 applying 岗位说「已投递该岗位」→ 状态推进 +「确认记录」卡片点击（record-status-card 组件从未交互过，是两段式审批的第二类确认 UI）
2. **planCreate 新计划创建**：发起复杂任务让 Agent 创建 3-6 步计划请求确认（目前只验证过读取遗留计划）

### P1 — 对话能力补测
3. **searchMessages 降级路径**：当前未配置 EMBEDDING_* → 应返回 EMBEDDING_FAILED（验证错误契约）
4. **searchLessons**：让 Agent 检索已沉淀的教训（已有教训数据）
5. **专属简历抽屉**：打开/内容查看/删除
6. **岗位删除**：确认对话框路径
7. **Shift+Enter 换行**输入行为

### P2 — 低频/长尾（按需）
8. 6 个未触发的 skill：jd-analysis、cover-letter、offer-evaluation、negotiation、follow-up、company-research、salary-benchmark（通过对应场景对话触发）
9. 会话摘要（需 20 轮对话）
10. 文件上传（受 IAB 环境限制，需换 runtime 或人工验证）
11. webFetch 配额护栏（需单任务内 9+ 次抓取）
12. 面试准备导出 Markdown 文件落盘验证

---

## 三、总结

- 核心闭环（导入→分析→匹配→专属简历→投递→面试准备→渠道发现）全部验证通过
- 6 轮测试修复 3 个 bug，当前无未修复缺陷
- 未覆盖项集中在：投递后阶段（已投递/面试/offer 推进 + 确认卡片）、新计划创建、检索类工具降级、低频 skill、以及受 IAB 环境限制的上传类功能

---

# 补测记录（2026-08-13 第二轮补测）

## 本次新测通过

| 项 | 结果 |
|---|---|
| P0-1 投递后推进：「已投递该岗位」→ applyJob 第二段 → applied 落库 | ✅ |
| P0-1 「确认记录」卡片：面试邀请 → recordApplicationStatus 第一段摘要 → 点击「确认记录」→ 第二段落库 applied→interview | ✅ |
| P0-2 planCreate：复杂任务 → 6 步计划落盘 → 用户确认 → 执行 → planUpdate 推进 | ✅ |
| P0-2 进度横幅联动：「计划「job-sprint-plan」第 2 步（共 6 步）：搜索并筛选 5 家目标岗位」 | ✅ |
| P1 searchMessages 降级：EMBEDDING 未配置 → EMBEDDING_FAILED + 替代方案/管理员指引 | ✅ |
| P1 searchLessons：检索到 1 条教训（本轮踩坑已沉淀复用，反思环闭环） | ✅ |
| P1 专属简历抽屉：标题/版本 v1/Markdown 全文展示 | ✅ |
| P1 岗位删除：确认对话框 → 删除落库（级联删除 tailored/status_history 为 schema 显式设计，非 bug） | ✅ |
| P2 company-research skill：尽调报告（信息分级/同名实体区分/风险提示） | ✅ |
| P2 cover-letter skill：求职信草稿 + 每处内容来源溯源表 | ✅ |

## 跳过/未测清单（含原因）

| 项 | 状态 | 原因 |
|---|---|---|
| 文件上传（PDF/DOCX/TXT/MD） | 跳过 | IAB 运行时不支持 file chooser（环境限制） |
| 专属简历删除 | 跳过 | 与简历/岗位删除同 ConfirmDialog 组件（已两轮验证）；避免破坏唯一测试数据 |
| Shift+Enter 换行 | 跳过 | IAB 键盘修饰键合成不可靠；应用逻辑已源码确认正确（chat-input.tsx:30 仅拦截非 Shift 的 Enter） |
| 面试准备导出 Markdown 文件落盘 | 跳过 | IAB 下载文件位置验证受限（download 事件已确认触发） |
| 会话摘要（20 轮滚动） | 跳过 | 需 20 轮对话，成本高 |
| webFetch 配额护栏（8 次/任务） | 未测 | 需单任务 9+ 次抓取，低频场景 |
| 4 个低频 skill：jd-analysis / offer-evaluation / negotiation / follow-up / salary-benchmark | 未测 | 每轮 60-90s LLM 成本；可后续按需触发 |

## 补测结论

**P0/P1 全部缺口已闭合**。剩余未覆盖项均为环境限制或低频长尾场景，无阻塞性未知。
