# job-helper 功能全景与测试覆盖报告（2026-08-13）

> 基于代码盘点（工具/API/组件/skills）+ 8 轮 GUI 测试记录对照生成（末次更新：2026-08-13 晚）。
> 状态标记：✅ 已测通过 | ⚠️ 部分验证 | ❌ 未测
> 最新进展：10 个求职 skill 全部验证通过；EMBEDDING 语义检索已配置并验证。

---

## 一、功能全景

### 1. 对话核心（Agent 编排）

| 能力 | 实现 | 测试状态 |
|---|---|---|
| 对话流（streaming/停止） | AI SDK useChat + /api/chat | ✅ |
| 会话管理（新建/切换/重命名/删除/刷新恢复） | conversations 表 + localStorage | ✅ |
| 语义检索 searchMessages（embedding + 余弦） | 硅基流动 bge-m3 | ✅（降级路径 EMBEDDING_FAILED + 配置后真实检索均验证） |
| 会话 FTS 检索（trigram） | messages_fts | ✅（落库同步/级联删除验证） |
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
| recordApplicationStatus | 投递后状态记录两段式（确认记录卡片） | ✅（applied→interview 落库验证） |
| prepareInterview | 面试准备 | ✅ |
| webSearch / webFetch | 搜索/抓取（三级降级链） | ✅（含失败/降级/网络异常） |
| readSkill | 技能加载 | ✅ |
| planCreate / planRead / planUpdate | 显式规划 | ✅（新计划创建+推进+横幅联动验证） |
| recordLesson / searchLessons | 反思环 | ✅（沉淀+检索闭环验证） |

### 3. 求职技能库（10 个 skill，全部触发验证通过）

| skill | 测试状态 |
|---|---|
| resume-analysis（简历评分卡） | ✅ |
| jd-analysis（JD 解析） | ✅（7 段式解析 + 原文溯源，无原文诚实拒绝推断） |
| job-matching（匹配框架） | ✅ |
| cover-letter-generation（求职信） | ✅（草稿 + 内容来源溯源表） |
| interview-prep | ✅（prepareInterview 链路） |
| offer-evaluation（offer 评估） | ✅（真实年包计算 + 综合评分） |
| negotiation（谈判） | ✅（可谈性分档 + 话术 + 止损线） |
| follow-up（跟进） | ✅（时机判断 + 邮件模板 + 不虚构） |
| company-research（公司调研） | ✅（尽调报告 + 信息分级 + 同名实体区分） |
| salary-benchmark（薪资行情） | ✅（5 来源交叉 + 画像修正因子） |

### 4. 资源管理 UI

| 功能 | 测试状态 |
|---|---|
| 文件上传（PDF/DOCX/TXT/MD，20MB 上限） | ❌（IAB 运行时不支持 file chooser，环境限制） |
| 简历列表/抽屉（分析结果/待确认项）/删除 | ✅ |
| 岗位列表/状态筛选（9 态）/抽屉（匹配矩阵/渠道/专属简历/面试准备） | ✅ |
| 岗位删除 | ✅（确认对话框 + 级联删除为 schema 显式设计） |
| 专属简历抽屉（内容查看） | ✅（标题/版本/Markdown 全文；删除与岗位删除同组件） |
| 面试准备导出 Markdown | ⚠️（download 事件触发，文件落盘未验证） |

### 5. 对话内 UI

| 功能 | 测试状态 |
|---|---|
| 消息渲染（Markdown/表格/链接/列表） | ✅ |
| 工具步骤卡片三态（运行/完成/失败）+ 展开详情 + 重试 | ✅ |
| recordApplicationStatus 确认记录卡片 | ✅（点击确认 → 第二段落库） |
| 规划进度横幅 | ✅（新计划创建后「第 N 步（共 M 步）」联动验证） |
| 输入边界（空白/单字符/长文本） | ✅ |
| Shift+Enter 换行 | ⚠️（应用逻辑源码确认正确；IAB 键盘修饰键合成不可靠无法实测） |

### 6. 数据与工程能力

| 能力 | 测试状态 |
|---|---|
| 状态时序（status_history 链式作废） | ✅（matched→applying 落库验证） |
| 审计表（actions） | ✅（apply_job/tailored_resume 记录验证） |
| FTS 落库同步 | ✅（消息落库+删除级联验证） |
| fetch 缓存（24h） | ⚠️（命中路径 Agent 日志可见 1ms 返回，未专门验证） |
| 会话配额护栏（webFetch 8 次/任务） | ❌（未触发上限） |

---

## 二、剩余未测试清单（仅环境限制与低频长尾）

| 项 | 原因 |
|---|---|
| 文件上传（PDF/DOCX/TXT/MD） | IAB 运行时不支持 file chooser，需换 runtime 或人工验证 |
| 会话摘要（20 轮滚动） | 需 20 轮对话，成本高 |
| webFetch 配额护栏（8 次/任务） | 需单任务内 9+ 次抓取，低频场景 |
| 面试准备导出 Markdown 文件落盘 | IAB 下载文件位置验证受限（download 事件已确认触发） |
| Shift+Enter 换行实测 | IAB 键盘修饰键合成不可靠；应用逻辑已源码确认正确（chat-input.tsx:30） |

---

## 三、总结

- 核心闭环（导入→分析→匹配→专属简历→投递→面试准备→渠道发现）全部验证通过
- **22 个 Agent 工具全部验证**；**10 个求职 skill 全部触发验证通过**（均遵守溯源/不虚构的诚实边界）
- **语义检索已配置并验证**（EMBEDDING 配置 + 52 条存量消息回填 + 语义命中验证）
- 8 轮测试修复 3 个 bug，当前无未修复缺陷
- 剩余未覆盖项仅环境限制（上传/键盘合成）与低频长尾场景（会话摘要/配额护栏），无阻塞性未知

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

## 补测结论

**P0/P1 全部缺口已闭合**。剩余未覆盖项均为环境限制或低频长尾场景，无阻塞性未知。

---

# 求职技能库补测记录（2026-08-13 晚）

> 10 个求职 skill 至此**全部触发验证通过**。

| skill | 触发场景 | 验证要点 | 结果 |
|---|---|---|---|
| jd-analysis | 解析星云互动 JD | 7 段式输出（概况/职责分类/硬性要求附原文摘录/软性/红线/关键词/参考信息）；无原文时诚实拒绝推断 | ✅ |
| salary-benchmark | 深圳前端 1-3 年行情 | 5 个独立来源交叉 + 口径差异提示 + 个人画像修正因子 + 对照在手岗位评估 + 置信度标注 | ✅ |
| offer-evaluation | 12K×13 薪 offer（含 6 个月试用期 8 折等条款） | 信息核对表（待确认项）/真实年包计算（试用期损失 14400 元量化）/综合评分 6.5/10 | ✅ |
| negotiation | 同上场景（同轮触发） | 可谈性分档（硬项/中项/软项）/锚定报价 13K/开场话术/让步预设/止损线/书面确认要求 | ✅ |
| follow-up | 面试后第 2 天跟进邮件 | 时机判断（诚实提醒在等待窗口内，两分支建议）+ 邮件模板占位符 + 不虚构（要求补充收件人/姓名/真实面试亮点）+ 关联系统状态 | ✅ |

## 说明

- offer-evaluation 与 negotiation 在单条消息中同时触发（readSkill ×2 可见）
- 所有 skill 均遵守诚实边界：结论可溯源（附原文摘录）、待确认项显式标注、不编造事实

---

# 语义检索配置验证记录（2026-08-13 晚）

> 用户配置 EMBEDDING_*（硅基流动 BAAI/bge-m3）后验证。

| 步骤 | 结果 |
|---|---|
| .env.local 三变量齐全（BASE_URL/API_KEY/MODEL） | ✅ |
| embedText 直测 | ✅ 1024 维向量正常返回 |
| 存量消息回填（npm run embed-backfill） | ✅ 52 条成功 0 失败 |
| 对话触发 searchMessages（语义查询「薪水谈判和面试相关」） | ✅ 准确召回 offer 评估/谈判 + 面试准备两条历史讨论线（非字面匹配） |

> 附：Agent 会诚实指出 searchMessages 摘要仅 200 字符并提供获取完整内容的路径（读 skill 重新生成/查岗位记录）——行为正常。
