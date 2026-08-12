# OpenCLI 求职站点采集评估报告（Boss直聘 / 前程无忧）

日期：2026-08-12
状态：实测完成，供 web 工具设计引用（第三条采集路线评估）
关联文档：`2026-08-12-job-sites-fetchability-assessment.md`（curl/浏览器两层评估，本报告修正其 Boss 结论）、`2026-08-12-web-tools-research.md`（Web 工具调研报告）
工具：OpenCLI（`@jackwener/opencli@1.8.6`，npm 全局）+ Chrome 扩展（v1.0.22）+ 本地 daemon（port 19825）

## 1. 评估目标

前两份评估已覆盖两条采集路线：curl 直抓（模拟自建 web-fetch）与 IAB 内嵌浏览器（模拟 web-browse / Jina Reader）。本报告评估第三条路线——**OpenCLI（真实 Chrome + 站点适配器）**：能否采集 curl/浏览器拿不到的站点（重点是 Boss直聘），采集质量如何，对 job-helper 有什么启示。

## 2. 环境与适配器

`opencli doctor` 全部 OK（daemon + 扩展 + profile `vmhtnh8p` 已连接）。求职相关站点适配器：

| 适配器 | 命令 | 说明 |
|---|---|---|
| **boss**（16 命令） | `whoami` / `search` / `detail` / `login` / `recommend` / `chatlist` / `greet` / `resume` 等 | 招聘端 + 求职端（geek）能力，部分命令带 cookie 要求 |
| **51job**（4 命令） | `search` / `detail` / `company` / `hot` | 标 [cookie] 但实测游客可用 |
| 其他 | maimai（脉脉）、linkedin、indeed、nowcoder（牛客）等 | 未在本次范围 |

**OpenCLI 无猎聘/智联适配器**（163 个站点列表中没有 liepin/zhaopin）——这两站不在 OpenCLI 覆盖范围。

## 3. 51job：三层采集全部成功（未登录）

| 命令 | 结果 | 输出要点 |
|---|---|---|
| `search "前端" --area 北京 --limit 5` | ✅ 结构化 JSON | 职位名/薪资（含数值化 min/max）/城市区/年限/学历/tags/公司全名/类型/规模/行业/HR 名/发布日期/详情 URL/公司 URL（encCoId） |
| `detail 173233900` | ✅ 结构化 JSON | 岗位要求全文、类别、薪资、地点、公司信息 |
| `company <encCoId>` | ✅ 结构化 JSON | 公司简介 + 在招职位列表 |

对比前报告：curl 层 51job 被阿里云 WAF JS 挑战拦截、IAB 浏览器层搜索异常（"暂无相关职位"+ 错误定位娄底）——**OpenCLI 全部绕过且搜索正常返回北京职位**（佐证之前"暂无相关职位"确为 IP 定位异常而非站点问题）。

**已知瑕疵**（适配器抓取字段不稳定，采集后需清洗）：
- `detail` 的 `title` 字段抓到页面"APP下载"按钮文案（真实职位名在 `category` 字段）
- `company` 的 `companyName` 字段同样抓到"APP下载"（真实公司名在 `companyIntro` 文本中）

## 4. Boss直聘：需登录态，登录后完整可采（修正前报告结论）

| 阶段 | 结果 |
|---|---|
| 未登录 `whoami` | `AUTH_REQUIRED`（"Boss wt2 / t cookies missing"） |
| 未登录 `search` | `您的IP地址存在异常行为. (code=35)`——**即使真实 Chrome 扩展也被 IP 风控拦截**，证实前报告"IP 级风控"判断 |
| `login`（Chrome 弹登录页，用户手机号+验证码） | ✅ `login_complete, logged_in: true, user_type: geek` |
| 登录后 `search "前端开发" --city 北京` | ✅ **IP 风控消失**，职位列表结构化输出：职位/薪资（7-11K）/公司/区域/经验/学历/技能/HR（姓名+职位）/在线状态/详情 URL |
| 登录后 `detail <security-id>` | ✅ 完整详情：岗位职责/任职要求/加分项全文、福利（五险一金等）、HR 活跃时间、公司行业/规模/地址 |

**登录后需要重新建标签页**（`opencli browser boss tab new`）：登录流程结束会关闭标签，适配器报 "stale page identity" / "Detached" 时重建即可恢复。

**敏感信息注意**：Boss 搜索结果与详情输出包含 `security_id`（超长加密请求签名 token）——**该字段不得写入日志/数据库/评估报告**（对齐 AGENTS.md 敏感信息红线），未来集成时需在管线中过滤。

## 5. 三条采集路线对比（Boss直聘 / 51job）

| 路线 | 技术 | Boss直聘 | 51job | 输出 | 依赖 |
|---|---|---|---|---|---|
| curl 直抓（自建 web-fetch） | HTTP + 解析 | ❌ IP 风控 | ❌ 阿里云 WAF | HTML/文本 | 无 |
| 内嵌浏览器（web-browse / Jina） | 渲染 + DOM | ❌ 图形验证码 | ⚠️ 可见但需操作（搜索异常） | DOM/截图 | 浏览器 |
| **OpenCLI** | 真实 Chrome + 适配器 | ✅ 登录后全通 | ✅ 全通（未登录） | **结构化 JSON** | daemon + Chrome 扩展 + 登录态（仅 Boss） |

## 6. 对 job-helper 的启示

1. **Boss直聘结论修正**：前报告"不可自动抓取"应修正为"**未登录不可抓取（IP 风控 + 验证码），登录态 + 真实 Chrome 下可完整采集**"。OpenCLI 是唯一实测可行的 Boss 采集路线——前提是用户在本机 Chrome 登录 Boss（本项目单用户本地优先，登录态可用性成立）。
2. **结构化输出的价值**：OpenCLI 直接产出与项目 data model 高度对齐的结构化字段（薪资 min/max 数值、公司规模枚举、URL），省去自建 HTML→结构化 解析管线；`-f json` 可被工具层直接消费。
3. **集成方式选项**：web 工具的后端可设计为"策略切换"——自建 fetch（智联/猎聘详情）→ Jina（渲染页）→ OpenCLI 子进程调用（Boss/51job）逐级降级；OpenCLI 作为本地 CLI（npm 全局）满足本地优先约束，无外部服务依赖。
4. **安全护栏**：Boss 输出含 `security_id` 敏感 token，工具层必须在日志/存储前过滤；OpenCLI 适配器执行真实浏览器操作，调用需与审批三档挂钩（读取类免确认、写操作如 greet/send 必须两段式确认）。
5. **覆盖面限制**：猎聘/智联无适配器（智联自建 fetch 已覆盖；猎聘详情页自建 fetch 已覆盖，列表页仍需 Jina/浏览器路线）——OpenCLI 是补充而非替代。
6. **字段清洗需求**：51job 适配器存在抓取字段错位（"APP下载"），集成时需以多字段交叉校验（如 companyIntro 文本 vs companyName）或直接读页面 DOM 修复。

## 7. 限制与后续待测

- Boss 登录态为一次性人工操作（手机验证码），后续采集依赖 cookie 有效期；OpenCLI daemon 重启/profile 切换后需复验。
- 未测：Boss `recommend`（推荐职位）、`chatlist`（求职端聊天——涉及隐私数据，评估时未触碰）；51job `hot`；脉脉/牛客适配器。
- 未测：OpenCLI 高频调用下的风控阈值（本次仅数次调用）；并发/排队机制。
- 猎聘列表页的 OpenCLI 覆盖：无适配器，维持"Jina/浏览器渲染"路线结论。

## 8. 一句话总结

OpenCLI（真实 Chrome + 163 站适配器 + 结构化 CLI 输出）实测补齐了前两条路线的空白：**51job 三层采集未登录全通**（绕过阿里云 WAF），**Boss直聘登录后列表+详情完整可采**（修正"不可自动抓取"结论为"需登录态"）——是 job-helper web 工具"自建 fetch → Jina → OpenCLI"三级降级链中的可行第三级，集成时需处理 security_id 敏感字段过滤与 51job 字段错位清洗。
