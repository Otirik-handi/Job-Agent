# 设计：简历文件上传导入（手动上传文件）

日期：2026-08-05
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）、plan-document.md
设计依据：`docs/designs/2026-08-04-agent-architecture-design.md`（工具全景）、`docs/designs/2026-08-04-data-model-design.md`（resumes）、`docs/designs/2026-08-04-api-design.md`（API 约定）、`docs/designs/2026-08-05-ui-ux-softui-design.md`（Soft UI）
前置：第 1 期已交付（importResume/analyzeResume、对话流、UI）；第 2 期已交付

## 1. 背景

当前简历导入仅两条路：对话中粘贴文本（`importResume.text`）、或给 Agent 一个本机文件路径（`importResume.filePath`，支持 .docx/.txt/.md，**明确不支持 PDF**）。用户希望新增第三条路：**在网页上直接选择文件上传**，从浏览器把简历文件送进系统。

## 2. 范围与决策（2026-08-05 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 支持格式 | **PDF + DOCX + TXT/MD**（PDF 用纯 JS 库提取文本层；扫描件/图片型 PDF 无文本层，明确报错提示） |
| 2 | 上传后流程 | **仅导入**，不自动分析；分析仍由用户在对话中指挥（保留人工确认点） |
| 3 | 文件存储 | **只存提取文本**（复用 resumes.sourceText），不上传/不保留原文件 |
| 4 | 上传入口 | 侧边栏「简历」标签页顶部「上传简历」按钮 |
| 5 | 上传通道 | **直调 REST API**（不经 Agent、不进 LLM 上下文）；上传成功后在 UI 内联提示"可在对话中让 Agent 分析" |
| 6 | 数据模型 | 零变更（resumes.sourceType 存扩展名、sourceText 存文本） |
| 7 | PDF 解析库 | **unpdf**（实施验证后确定）：主选 pdf-parse 实测在 Next dev（turbopack）下 fake worker 初始化失败，按备选条款切换；unpdf 无 worker 依赖，Node 开箱即用 |
| 8 | 一致性 | 提取逻辑抽为共享模块，`importResume` 的 filePath 分支同步支持 PDF（现状明确报"不支持 PDF"） |

## 3. 服务端

### 3.1 共享文本提取模块（扩展现有 `src/agent/resume-text.ts`）

新增文件格式分派（复用现有 `normalizeResumeText` / `assertTextLength` / `ResumeTextError`）：

- 格式白名单：`.pdf` / `.docx` / `.txt` / `.md`
- `.docx`：mammoth（现有依赖）
- `.pdf`：pdf-parse（或 unpdf），提取全部页文本层
- `.txt` / `.md`：UTF-8 readFile
- PDF 无文本层（扫描件）：抛 `ResumeTextError`，消息明确提示改用 DOCX/TXT 或粘贴文本

### 3.2 新端点 `POST /api/resumes/upload`

```
请求：multipart/form-data，字段 file
校验（服务端为准，不信任客户端）：
  - 扩展名 ∈ {pdf, docx, txt, md}，否则 400 UNSUPPORTED_FORMAT
  - 大小 ≤ 20MB，否则 400 FILE_TOO_LARGE
流程：提取文本 → normalizeResumeText → assertTextLength（复用上限与规则）
  → createResume({ name, sourceType: 扩展名, sourceText })
命名：文件名去扩展名；与库内已有简历重名时自动追加时间戳后缀（如"张三-20260805-1530"）
返回 200：{ id, name, sourceType, charCount, preview }
错误：
  400 INVALID_FILE（空文件/无法读取）
  400 FILE_TOO_LARGE / UNSUPPORTED_FORMAT
  422 PARSE_FAILED（统一码，message 区分场景：PDF 扫描件提示 / 空文本 / 解析异常）
  其余解析异常统一 422 PARSE_FAILED（日志记录原因，不暴露细节）
```

> 实施注记（2026-08-05）：错误码实际统一为 `PARSE_FAILED` + 可读 message 区分（前端仅消费 message，无区分码消费方），与计划一致；如未来出现机器消费方再拆 `PDF_NO_TEXT` / `EMPTY_TEXT`。

错误响应沿用现有 API 约定：`{ code, message }`。

## 4. 前端（侧边栏「简历」标签页）

`src/components/sidebar/resource-tabs.tsx`：

- 简历标签页顶部新增「上传简历」按钮（Soft UI 风格：indigo 主色、圆角、hover 提亮）
- 点击触发隐藏 `<input type="file" accept=".pdf,.docx,.txt,.md">`，选择后立即上传
- 上传状态机：`idle → uploading（按钮禁用 +「解析中…」）→ success | error`
- 成功：刷新简历列表（复用 `useResumes` 的 refresh）+ 内联成功提示「已导入《名称》，可在对话中让 Agent 分析」
- 失败：内联错误条，按错误码展示可读消息（格式不支持 / 超过 20MB / 扫描件 PDF 提示 / 其他）
- 前端预检（体验优化，服务端仍兜底）：扩展名 + 大小（>20MB 直接拦截提示）
- 空状态文案更新：「暂无简历，可上传文件（PDF/DOCX/TXT/MD）或在对话中粘贴文本导入」

交互细节：上传期间按钮禁用防重复提交；成功后按钮恢复可用。

## 5. 错误与边界汇总

| 场景 | 行为 |
|---|---|
| 不支持格式 / 超 20MB | 前端预检拦截；服务端兜底 400 |
| 扫描件 PDF（无文本层） | 422 PDF_NO_TEXT，提示改用 DOCX/TXT 或粘贴 |
| 提取文本为空 / 超长 | 复用 assertTextLength 规则（422 EMPTY_TEXT） |
| 同名重复导入 | 允许，name 自动加时间戳后缀 |
| 上传失败 | 不产生任何 DB 记录（先解析后入库，原子性） |

## 6. 测试

按项目原则（测试服务于功能推进），仅对纯逻辑做轻量单测：

- 扩展名 → 解析器分派（白名单 / 非法格式）
- 重名命名逻辑（时间戳后缀）
- PDF/DOCX 解析为库调用，人工验证（提供测试用样例文件）

## 7. 不在本期范围

- 图片 / 扫描件 OCR
- 原文件存档（磁盘管理）
- URL 拉取简历
- 上传后自动分析
